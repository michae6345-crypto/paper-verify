"""The run state machine (§14.2), the drivers over it (§14.6), and the failure
taxonomy it completes (§14.7).

Every run here is driven from `fixtures/papers/`, so nothing touches the network.
The one paper used for real is the Transformer paper — the canonical end-to-end
case — and most tests use a stub stage instead, because a state machine is worth
testing at every transition and a real parse is worth about a second each time.

What the suite is actually protecting:
  - the transitions are the ones §14.2 draws, and no others;
  - `failed` is reachable only from `resolving` and `extracting`;
  - `advance` does one unit of work, so a killed process resumes at the next one;
  - a run never blocks indefinitely on a human;
  - every failure carries a reason code, and none is dropped.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from pv import orchestrator as orch
from pv.adapters.circuit import BreakingClient, CircuitBreaker
from pv.adapters.http import ErrorKind, FakeClient, HttpResponse, network_error, ok
from pv.models import (
    Anchor,
    Artifact,
    CheckContext,
    CheckResult,
    NotChecked,
    ReasonCode,
    SourceDocument,
    Table,
    Verdict,
)
from pv.orchestrator import (
    FileStateStore,
    MemoryStateStore,
    Orchestrator,
    RunNotFound,
    RunNotWaiting,
    RunOptions,
    RunStage,
    collect_not_checked,
)
from pv.run import run_paper

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "papers"
PAPER = "1706.03762"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """The same guard the API suite uses. A stray request to arXiv is invisible —
    it fails nothing, it just makes the suite slower — so it is stubbed rather
    than merely configured off."""

    def forbidden(*args, **kwargs):
        raise AssertionError("this test tried to reach the network")

    monkeypatch.setattr("pv.ingest.fetch._download", forbidden)
    monkeypatch.setattr("pv.adapters.http.HttpxClient", forbidden)
    monkeypatch.setenv("HTTP_BACKEND", "offline")


_INGESTED: dict[str, object] = {}
_PARSED: dict[str, list[Table]] = {}


@pytest.fixture(autouse=True)
def cheap_stages(monkeypatch):
    """Ingest and parse the fixture paper once for the whole module.

    These tests are about the state machine, not about the parser, and a real
    ingest plus parse of the Transformer paper costs about a second. Forty of
    those is the difference between a suite people run and a suite people skip.
    The results are handed out as deep copies so no test can see another's state.

    A test that patches either stage itself patches after this fixture, so its
    own stub wins.
    """
    real_ingest = orch.ingest_directory
    real_parse = orch.parse_document

    def ingest_once(directory, *, arxiv_id):
        key = f"{directory}\x00{arxiv_id}"
        if key not in _INGESTED:
            _INGESTED[key] = real_ingest(directory, arxiv_id=arxiv_id)
        return _INGESTED[key]

    def parse_once(document):
        key = document.source_hash or document.arxiv_id
        if key not in _PARSED:
            _PARSED[key] = real_parse(document)
        return [t.model_copy(deep=True) for t in _PARSED[key]]

    monkeypatch.setattr(orch, "ingest_directory", ingest_once)
    monkeypatch.setattr(orch, "parse_document", parse_once)


def fixture_options(**kw) -> RunOptions:
    return RunOptions(
        **{
            "checks": ("bold_extreme",),
            "from_directory": str(FIXTURES / PAPER),
            "allow_network": False,
            **kw,
        }
    )


def new_orchestrator() -> Orchestrator:
    return Orchestrator(store=MemoryStateStore())


def stages_to_terminal(o: Orchestrator, run_id: str, limit: int = 200) -> list[RunStage]:
    """Every stage the run passed through, in order, including the terminal one."""
    seen: list[RunStage] = []
    for _ in range(limit):
        state = o.advance(run_id)
        seen.append(state.stage)
        if state.is_terminal:
            break
    return seen


# --------------------------------------------------------------------------
# §14.2 — the state machine
# --------------------------------------------------------------------------


def test_a_run_starts_queued_and_does_no_work_until_advanced():
    """`start` issues an id. The API needs one before the first stage runs, so
    that a permalink exists while the paper is still being fetched."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    state = o.state(run_id)
    assert state.stage is RunStage.QUEUED
    assert state.document is None and state.results == []


def test_the_run_walks_exactly_the_states_section_14_2_draws():
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    assert stages_to_terminal(o, run_id) == [
        RunStage.RESOLVING,
        RunStage.EXTRACTING,
        RunStage.MINING,
        RunStage.AWAITING_ARTIFACT,
        RunStage.PLANNING,
        RunStage.CHECKING,
        RunStage.ADJUDICATING,
        RunStage.COMPLETE,
    ]


def test_advance_does_one_unit_of_work_at_a_time():
    """One check per advance is what lets the stream publish a result the moment
    it lands, and what lets a killed process resume at the check that had not run."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(checks=("bold_extreme", "row_arithmetic")))
    counts = []
    while True:
        state = o.advance(run_id)
        counts.append(len(state.results))
        if state.is_terminal:
            break
    assert counts.count(0) >= 1  # stages before any check ran
    assert counts[-1] == 2
    # Never two results from one advance.
    assert all(b - a <= 1 for a, b in zip(counts, counts[1:]))


def test_advancing_a_terminal_run_is_a_no_op():
    """A driver that calls once more than it needed to must not produce a second
    report, or start the pipeline again."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    o.drive(run_id)
    before = o.state(run_id).model_dump_json()
    assert o.advance(run_id).stage is RunStage.COMPLETE
    assert o.state(run_id).model_dump_json() == before


def test_an_unknown_run_id_raises_rather_than_inventing_a_run():
    with pytest.raises(RunNotFound):
        new_orchestrator().advance("deadbeef")


# --------------------------------------------------------------------------
# failed, complete, partial
# --------------------------------------------------------------------------


def test_no_source_fails_in_resolving_with_a_reason_code():
    """`failed` is reserved for the two stages where there is genuinely nothing
    to show. It is still a report: §5.5 says what happened."""
    o = new_orchestrator()
    run_id = o.start("2401.00001", opts=RunOptions(allow_network=False))
    assert stages_to_terminal(o, run_id) == [RunStage.RESOLVING, RunStage.FAILED]

    report = o.report(run_id)
    assert report.checks == []
    assert [n.reason for n in report.not_checked] == [ReasonCode.NETWORK_ERROR]


def test_a_malformed_identifier_is_its_own_reason_code():
    """Distinct from `no_latex_source`, which means a real paper that shipped no
    LaTeX. The two read completely differently in §5.5."""
    o = new_orchestrator()
    run_id = o.start("not-a-paper", opts=RunOptions(id_error="not an arXiv id"))
    assert stages_to_terminal(o, run_id) == [RunStage.RESOLVING, RunStage.FAILED]
    assert [n.reason for n in o.report(run_id).not_checked] == [ReasonCode.INVALID_PAPER_ID]


def test_a_parse_failure_fails_in_extracting_not_later(monkeypatch):
    def explode(document):
        raise RuntimeError("tabular from hell")

    monkeypatch.setattr(orch, "parse_document", explode)
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    assert stages_to_terminal(o, run_id) == [
        RunStage.RESOLVING,
        RunStage.EXTRACTING,
        RunStage.FAILED,
    ]
    assert [n.reason for n in o.report(run_id).not_checked] == [
        ReasonCode.TABLE_STRUCTURE_NOT_PARSED
    ]


def test_failed_is_unreachable_once_extraction_succeeds(monkeypatch):
    """§14.2. Every check raising is still a report about the paper — there is
    something to show, so there is no state in which we show nothing."""

    def always_raises(ctx):
        raise RuntimeError("nope")

    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(stage_timeout_s=None))
    o.advance(run_id)  # resolving
    o.advance(run_id)  # extracting
    monkeypatch.setattr("pv.checks.bold_extreme.run", always_raises)
    state = o.drive(run_id)
    assert state.stage is RunStage.PARTIAL
    assert [c.reason for c in state.results] == [ReasonCode.CHECKER_ERROR]


class _DeclinesToJudge:
    """A check that did all the work there was and will not guess — the
    `metric_direction_unknown` case from CLAUDE.md."""

    CHECKER_NAME = "declines"
    CHECKER_VERSION = "1"
    DISPLAY_NAME = "Declines to judge"
    DESCRIPTION = ""

    def run(self, ctx: CheckContext) -> CheckResult:
        return CheckResult(
            checker=self.CHECKER_NAME,
            checker_version=self.CHECKER_VERSION,
            verdict=Verdict.UNVERIFIABLE,
            reason=ReasonCode.METRIC_DIRECTION_UNKNOWN,
        )


def test_an_honest_unverifiable_is_complete_not_partial(monkeypatch):
    """Honest incompleteness is the product (CLAUDE.md). A run that did all the
    work there was and declined to judge must not be filed under the same word as
    a run that could not do the work."""
    monkeypatch.setattr(orch.registry, "discover", lambda names: [_DeclinesToJudge()])
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(checks=("declines",)))
    state = o.drive(run_id)
    assert state.results[0].reason is ReasonCode.METRIC_DIRECTION_UNKNOWN
    assert state.stage is RunStage.COMPLETE
    # And it is still reported: declining to judge is never a silent omission.
    assert [n.reason for n in state.not_checked] == [ReasonCode.METRIC_DIRECTION_UNKNOWN]


def test_a_network_failure_makes_the_run_partial():
    """The other side of the same rule: we could not do the work, so we say the
    run is incomplete rather than presenting it as a finished one."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(checks=("citations",)))
    state = o.drive(run_id)
    assert state.results[0].reason is ReasonCode.NETWORK_ERROR
    assert state.stage is RunStage.PARTIAL


def test_a_missing_checker_is_a_row_not_a_silent_omission():
    """Discovery's contract (Agent H's step 1), asserted from the orchestrator's
    side: a name that does not resolve still produces a result and a §5.5 row."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(checks=("bold_extreme", "no_such_check")))
    state = o.drive(run_id)
    assert [c.checker for c in state.results] == ["bold_extreme", "no_such_check"]
    assert state.results[1].verdict is Verdict.NOT_ATTEMPTED
    assert ReasonCode.CHECKER_ERROR in {n.reason for n in state.not_checked}


# --------------------------------------------------------------------------
# §14.7 — stage timeout
# --------------------------------------------------------------------------


class _SlowChecker:
    """A check that does not return. `registry.run_check` cannot catch this:
    there is no exception, only a run that never ends."""

    CHECKER_NAME = "slow"
    CHECKER_VERSION = "1"
    DISPLAY_NAME = "A check that hangs"
    DESCRIPTION = ""
    started = False

    def run(self, ctx: CheckContext) -> CheckResult:
        _SlowChecker.started = True
        time.sleep(30)
        raise AssertionError("the orchestrator should have moved on")


def test_a_stage_that_never_returns_becomes_unverifiable_and_the_run_continues(monkeypatch):
    slow = _SlowChecker()
    monkeypatch.setattr(orch.registry, "discover", lambda names: [slow])

    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(checks=("slow",), stage_timeout_s=0.2))
    state = o.drive(run_id)

    assert _SlowChecker.started, "the check really was started, not skipped"
    assert state.results[0].verdict is Verdict.UNVERIFIABLE
    assert state.results[0].reason is ReasonCode.CHECKER_ERROR
    assert "did not finish" in state.results[0].description
    # The run continues to a report rather than dying at the wedged stage.
    assert state.stage is RunStage.PARTIAL
    assert o.report(run_id).finished_at is not None


def test_the_timeout_is_off_by_default_for_nothing():
    """A default of None would leave §14.7's row unimplemented in practice."""
    assert RunOptions().stage_timeout_s == orch.DEFAULT_STAGE_TIMEOUT_SECONDS


# --------------------------------------------------------------------------
# §14.2 / §5.2 — awaiting_artifact
# --------------------------------------------------------------------------


def test_a_run_that_is_not_asked_to_wait_passes_straight_through():
    """Every run enters `awaiting_artifact`; almost none stop there. A run that
    paused by default would be a run that hangs."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    state = o.drive(run_id)
    assert state.artifact is None and state.artifact_deadline is None
    assert state.stage is RunStage.COMPLETE


def advance_to_pause(o: Orchestrator, run_id: str):
    for _ in range(10):
        state = o.advance(run_id)
        if state.is_awaiting_artifact or state.is_terminal:
            return state
    raise AssertionError("the run never reached awaiting_artifact")


def test_a_run_pauses_for_the_repository_confirmation_and_offers_candidates():
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(await_artifact=True))
    state = advance_to_pause(o, run_id)

    assert state.stage is RunStage.AWAITING_ARTIFACT and state.is_awaiting_artifact
    # The Transformer paper links tensorflow/tensor2tensor.
    assert state.artifact_candidates[0].path == "tensorflow/tensor2tensor"
    assert state.artifact_deadline is not None


def test_confirming_a_repository_releases_the_run():
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(await_artifact=True))
    advance_to_pause(o, run_id)

    chosen = Artifact(url="https://github.com/tensorflow/tensor2tensor",
                      path="tensorflow/tensor2tensor")
    o.confirm_artifact(run_id, chosen)
    state = o.drive(run_id)
    assert state.stage is RunStage.COMPLETE
    assert state.artifact is not None and state.artifact.path == "tensorflow/tensor2tensor"


def test_continue_without_code_is_a_normal_answer_not_a_failure():
    """§5.2 calls it a legitimate path. `None` releases the run exactly as a
    repository does, and the run is `complete`."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(await_artifact=True))
    advance_to_pause(o, run_id)

    o.confirm_artifact(run_id, None)
    state = o.drive(run_id)
    assert state.stage is RunStage.COMPLETE
    assert state.artifact is None and not state.artifact_timed_out


def test_a_run_never_blocks_indefinitely_on_a_human():
    """The whole point of the state (§14.2). On expiry the run takes the same
    "continue without code" path, automatically."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(await_artifact=True, artifact_timeout_s=0.05))
    advance_to_pause(o, run_id)

    state = o.drive(run_id)
    assert state.artifact_timed_out and state.artifact is None
    # `partial`, because something prevented us from finishing the plan we had.
    assert state.stage is RunStage.PARTIAL
    row = next(n for n in state.not_checked if n.reason is ReasonCode.NO_CODE_REPOSITORY)
    assert "without code" in row.detail


def test_confirming_after_the_window_closed_is_a_conflict_not_an_error():
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(await_artifact=True, artifact_timeout_s=0.01))
    advance_to_pause(o, run_id)
    o.drive(run_id)
    with pytest.raises(RunNotWaiting):
        o.confirm_artifact(run_id, None)


def test_a_paper_with_no_repository_is_not_a_question_worth_asking(monkeypatch):
    monkeypatch.setattr(orch, "_repository_candidates", lambda document: [])
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options(await_artifact=True))
    state = o.drive(run_id)
    assert state.stage is RunStage.COMPLETE
    assert state.artifact_deadline is None


# --------------------------------------------------------------------------
# Persistence and resumability
# --------------------------------------------------------------------------


def test_state_round_trips_through_json_so_a_run_survives_a_restart(tmp_path):
    store = FileStateStore(tmp_path)
    o = Orchestrator(store=store)
    run_id = o.start(PAPER, opts=fixture_options(checks=("bold_extreme", "row_arithmetic")))
    # queued, resolving, extracting, mining, awaiting_artifact, planning, and
    # then the first of the two checks.
    for _ in range(7):
        o.advance(run_id)

    # A different process, holding nothing but the directory.
    resumed = Orchestrator(store=FileStateStore(tmp_path))
    mid = resumed.state(run_id)
    assert mid.stage is RunStage.CHECKING and 0 < len(mid.results) < 2
    assert mid.document is not None and mid.tables

    state = resumed.drive(run_id)
    assert state.stage is RunStage.COMPLETE
    assert [c.checker for c in state.results] == ["bold_extreme", "row_arithmetic"]


def test_resuming_re_runs_only_the_checks_that_had_not_run(tmp_path):
    """`len(results)` is the cursor into the plan, which is what makes `advance`
    idempotent: the work already recorded is never repeated."""
    store = FileStateStore(tmp_path)
    o = Orchestrator(store=store)
    run_id = o.start(PAPER, opts=fixture_options(checks=("bold_extreme", "row_arithmetic")))
    while o.state(run_id).stage is not RunStage.CHECKING:
        o.advance(run_id)
    o.advance(run_id)  # the first check
    first = o.state(run_id).results[0]

    Orchestrator(store=FileStateStore(tmp_path)).drive(run_id)
    results = Orchestrator(store=FileStateStore(tmp_path)).state(run_id).results
    assert len(results) == 2
    # Byte-identical: the first check was not executed a second time.
    assert results[0].model_dump_json() == first.model_dump_json()


def test_a_truncated_state_file_is_refused_rather_than_half_understood(tmp_path):
    """Resuming into a half-written record invents a report, which is worse than
    not resuming."""
    store = FileStateStore(tmp_path)
    o = Orchestrator(store=store)
    run_id = o.start(PAPER, opts=fixture_options())
    (tmp_path / f"{run_id}.json").write_text('{"run_id": "x", "stag', encoding="utf-8")
    assert FileStateStore(tmp_path).load(run_id) is None


def test_the_default_store_is_selected_by_env_not_by_a_branch(monkeypatch, tmp_path):
    monkeypatch.delenv("PV_STATE_DIR", raising=False)
    assert isinstance(orch.default_state_store(), MemoryStateStore)
    monkeypatch.setenv("PV_STATE_DIR", str(tmp_path))
    assert isinstance(orch.default_state_store(), FileStateStore)


# --------------------------------------------------------------------------
# §14.3 — the claim mining seam
# --------------------------------------------------------------------------


def test_claims_reach_the_check_context_when_a_miner_exists(monkeypatch):
    seen: dict[str, object] = {}

    def fake_mine(document: SourceDocument, tables: list[Table]):
        seen["tables"] = len(tables)
        return []

    monkeypatch.setattr(orch, "load_miner", lambda: fake_mine)
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    state = o.drive(run_id)
    assert state.stage is RunStage.COMPLETE
    # Nested tabulars are line-break helpers; the miner sees what the checks see.
    assert seen["tables"] == state.tables_parsed


def test_a_miner_that_raises_is_a_row_not_a_failed_run(monkeypatch):
    def explodes(document, tables):
        raise RuntimeError("no")

    monkeypatch.setattr(orch, "load_miner", lambda: explodes)
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    state = o.drive(run_id)
    assert state.stage is RunStage.COMPLETE
    assert any(
        n.what == "Claim mining" and n.reason is ReasonCode.CHECKER_ERROR
        for n in state.not_checked
    )


def test_no_miner_yet_means_no_claims_and_no_change_in_output(monkeypatch):
    """`pv.claims.mine` is Agent H's. Absent, `CheckContext.claims` stays empty —
    exactly what every checker sees today, so the corpus cannot move on the
    strength of this module existing."""
    monkeypatch.setattr(orch, "load_miner", lambda: None)
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    assert o.drive(run_id).claims == []


# --------------------------------------------------------------------------
# §14.6 — the synchronous driver
# --------------------------------------------------------------------------


def test_run_paper_is_the_orchestrator_and_nothing_else():
    """The CLI's entry point. What it returns is what `drive` + `report` produce,
    so the CLI and the API cannot reach different conclusions about a paper."""
    report = run_paper(PAPER, from_directory=str(FIXTURES / PAPER), checks=("bold_extreme",))

    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    o.drive(run_id)
    expected = o.report(run_id)

    assert report.arxiv_id == expected.arxiv_id
    assert report.title == expected.title
    assert report.tables_parsed == expected.tables_parsed
    assert [c.verdict for c in report.checks] == [c.verdict for c in expected.checks]
    assert [n.reason for n in report.not_checked] == [n.reason for n in expected.not_checked]


def test_run_paper_still_reports_a_paper_it_could_not_read():
    report = run_paper("2401.00001", allow_network=False)
    assert report.checks == []
    assert [n.reason for n in report.not_checked] == [ReasonCode.NETWORK_ERROR]


# --------------------------------------------------------------------------
# collect_not_checked — moved here from run.py unchanged (§14.6)
# --------------------------------------------------------------------------


def _document(**kw) -> SourceDocument:
    return SourceDocument(arxiv_id="0000.00000", **kw)


def test_not_checked_carries_the_ingest_reason():
    out = collect_not_checked(
        _document(ingest_reason=ReasonCode.NO_LATEX_SOURCE, ingest_detail="PDF only"), [], []
    )
    assert [(n.what, n.reason, n.detail) for n in out] == [
        ("Source for 0000.00000", ReasonCode.NO_LATEX_SOURCE, "PDF only")
    ]


def test_not_checked_reports_unparsed_tables_but_not_nested_ones():
    anchor = Anchor(kind="table", dom_id="tab:a")
    real = Table(label="tab:a", anchor=anchor, parse_warnings=["ragged rows"])
    nested = Table(label="tab:b", anchor=anchor, parse_warnings=["ragged"], is_nested=True)
    out = collect_not_checked(_document(), [real, nested], [])
    assert [n.what for n in out] == ["Table tab:a"]


def test_not_checked_records_every_check_that_declined():
    results = [
        CheckResult(checker="a", checker_version="1", verdict=Verdict.MATCHES),
        CheckResult(checker="b", checker_version="1", verdict=Verdict.UNVERIFIABLE,
                    reason=ReasonCode.METRIC_DIRECTION_UNKNOWN),
        CheckResult(checker="c", checker_version="1", verdict=Verdict.NOT_ATTEMPTED),
    ]
    out = collect_not_checked(_document(), [], results)
    assert [(n.what, n.reason) for n in out] == [
        ("b", ReasonCode.METRIC_DIRECTION_UNKNOWN),
        ("c", ReasonCode.NO_APPLICABLE_CLAIMS),
    ]


# --------------------------------------------------------------------------
# §14.7 — Crossref / OpenAlex down: the circuit breaker
# --------------------------------------------------------------------------


def test_the_breaker_opens_after_five_consecutive_failures():
    breaker = CircuitBreaker(threshold=5, cooldown_s=60.0)
    for _ in range(4):
        breaker.record("api.crossref.org", failed=True)
    assert not breaker.is_open("api.crossref.org")
    breaker.record("api.crossref.org", failed=True)
    assert breaker.is_open("api.crossref.org")


def test_one_answer_resets_the_count():
    """Consecutive, not cumulative. A service that answers between two timeouts
    is not down."""
    breaker = CircuitBreaker(threshold=3)
    breaker.record("api.openalex.org", failed=True)
    breaker.record("api.openalex.org", failed=True)
    breaker.record("api.openalex.org", failed=False)
    breaker.record("api.openalex.org", failed=True)
    assert not breaker.is_open("api.openalex.org")


def test_a_404_is_an_answer_and_leaves_the_circuit_closed():
    """The governing rule of the HTTP adapter, upheld here: a request that did
    not complete is never confused with one that came back not-found."""
    breaker = CircuitBreaker(threshold=2)
    for _ in range(5):
        breaker.record("example.org", failed=HttpResponse(url="u", status=404).failed)
    assert not breaker.is_open("example.org")


def test_the_circuit_reopens_the_door_after_the_cooldown():
    now = [1000.0]
    breaker = CircuitBreaker(threshold=1, cooldown_s=30.0)
    breaker.record("api.crossref.org", failed=True, now=now[0])
    assert breaker.is_open("api.crossref.org", now=now[0] + 5)
    assert not breaker.is_open("api.crossref.org", now=now[0] + 31)


@pytest.mark.asyncio
async def test_an_open_circuit_short_circuits_without_a_request():
    """The point: a fifty-reference bibliography must not send fifty requests at
    a free API that is already down."""
    inner = FakeClient(default=network_error(ErrorKind.TIMEOUT))
    client = BreakingClient(inner, CircuitBreaker(threshold=3, cooldown_s=60.0))
    for i in range(10):
        response = await client.get(f"https://api.crossref.org/works/{i}")
        assert response.failed
    assert len(inner.calls) == 3


@pytest.mark.asyncio
async def test_a_short_circuited_request_reads_as_unverifiable_never_as_a_verdict():
    """An open circuit means we know less, not more. `status is None` is what
    every check already reads as `unverifiable / network_error`."""
    client = BreakingClient(
        FakeClient(default=network_error(ErrorKind.TIMEOUT)),
        CircuitBreaker(threshold=1, cooldown_s=60.0),
    )
    await client.get("https://api.openalex.org/works/1")
    blocked = await client.get("https://api.openalex.org/works/2")
    assert blocked.status is None and blocked.failed
    assert "1 times in a row" in blocked.error_detail


@pytest.mark.asyncio
async def test_the_breaker_is_per_host():
    """Crossref being down says nothing about GitHub."""
    inner = FakeClient(
        routes={r"crossref": network_error(ErrorKind.TIMEOUT)}, default=ok('{"ok":1}')
    )
    client = BreakingClient(inner, CircuitBreaker(threshold=2, cooldown_s=60.0))
    for i in range(4):
        await client.get(f"https://api.crossref.org/works/{i}")
    assert (await client.get("https://api.github.com/repos/a/b")).ok


def test_the_live_client_is_wrapped_and_the_offline_one_is_not(monkeypatch):
    from pv.adapters import http

    monkeypatch.setenv("HTTP_BACKEND", "offline")
    assert isinstance(http.get_http_client(), http.OfflineClient)

    monkeypatch.setenv("HTTP_BACKEND", "live")
    monkeypatch.setattr(http, "HttpxClient", lambda **kw: http.OfflineClient())
    assert isinstance(http.get_http_client(), BreakingClient)


# --------------------------------------------------------------------------
# Housekeeping
# --------------------------------------------------------------------------


def test_the_report_is_the_contract_type_at_every_stage():
    """Mid-run this is a partial report: the checks that have finished, and
    nothing invented for the ones that have not."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    o.advance(run_id)
    o.advance(run_id)
    report = o.report(run_id)
    assert report.arxiv_id == PAPER and report.checks == []
    assert report.finished_at is None
    assert report.tables_parsed == len(report.tables)


def test_the_report_excludes_nested_tabulars_from_the_count():
    """A paper whose real content is four tables should not report eleven."""
    o = new_orchestrator()
    run_id = o.start(PAPER, opts=fixture_options())
    state = o.drive(run_id)
    assert state.tables_parsed == len(state.checkable_tables)
    assert all(not t.is_nested for t in o.report(run_id).tables)
