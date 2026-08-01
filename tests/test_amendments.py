"""The author response flow (brief Part 2, item 1).

Nothing here touches the network. The one test that drives a real run reads the
paper from `fixtures/papers/` and the offline guards from `test_api.py` are
repeated here for the same reason: arXiv allows one request every three seconds
and a test suite is the worst possible offender.

What this suite is protecting:
  - a fingerprint identifies a *judgement*, so improving a checker detaches an
    objection instead of silently carrying it onto a reading the author has never
    seen;
  - nothing is ever edited, including an amendment;
  - a recheck is a §14.5 cache lookup before it is an execution, and it never
    writes a verdict into the run.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pv.amendments.identity import (
    finding_fingerprint,
    fingerprints_in,
    locate_finding,
)
from pv.amendments.recheck import FindingNotInRun, recheck_finding
from pv.amendments.store import AmendmentStore
from pv.api import app as app_module
from pv.api.config import Settings
from pv.api.store import RunStore
from pv.models import (
    Amendment,
    Anchor,
    CheckResult,
    Finding,
    RunReport,
    Severity,
    Verdict,
)
from pv.orchestrator import MemoryStateStore, Orchestrator, RunOptions

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "papers"
# The BERT paper is the one real fixture that produces a finding at all — the
# GLUE average row, within tolerance. Every other corpus paper yields none, and a
# recheck test needs something real to recheck.
PAPER_WITH_A_FINDING = "1810.04805"


# --------------------------------------------------------------------------
# Material
# --------------------------------------------------------------------------


def a_finding(**overrides) -> Finding:
    defaults = dict(
        severity=Severity.HIGH,
        siglum="a",
        claimed="87.4",
        computed="84.1",
        delta="-3.3",
        anchor=Anchor(
            kind="table_cell",
            dom_id="tab:main/r2/c3",
            table_label="tab:main",
            row=2,
            col=3,
            human_locator='Table 3, row 2, column "Ours"',
        ),
        verbatim="Our method reaches 87.4 on the held-out split.",
        explanation="87.4 is bolded, but 84.1 is the highest value in this block.",
    )
    defaults.update(overrides)
    return Finding(**defaults)


def a_check(findings: list[Finding] | None = None, **overrides) -> CheckResult:
    defaults = dict(
        checker="bold_extreme",
        checker_version="1",
        policy_version="1",
        verdict=Verdict.DIVERGES,
        display_name="Bolded value is the best in its block",
        findings=findings if findings is not None else [a_finding()],
    )
    defaults.update(overrides)
    return CheckResult(**defaults)


def a_report(checks: list[CheckResult] | None = None) -> RunReport:
    return RunReport(
        arxiv_id="0000.00000",
        title="A synthetic paper for interface development",
        checks=checks if checks is not None else [a_check()],
    )


# --------------------------------------------------------------------------
# Identity (§14.5)
# --------------------------------------------------------------------------


def test_the_same_finding_fingerprints_the_same_way_every_time():
    check = a_check()
    once = finding_fingerprint(check, check.findings[0])
    twice = finding_fingerprint(a_check(), a_check().findings[0])
    assert once == twice
    assert len(once) == 64


def test_bumping_the_checker_version_detaches_the_amendment():
    """The whole reason a contest keys on a fingerprint rather than a row id.

    An objection was made about a specific reading of a paper under a specific
    checker. Improve the checker and the objection must stop resolving, because
    carrying it forward would show a contest of a finding the author never saw.
    """
    before = a_check()
    after = a_check(checker_version="2")
    assert finding_fingerprint(before, before.findings[0]) != finding_fingerprint(
        after, after.findings[0]
    )


def test_bumping_the_policy_version_detaches_the_amendment():
    before = a_check()
    after = a_check(policy_version="2")
    assert finding_fingerprint(before, before.findings[0]) != finding_fingerprint(
        after, after.findings[0]
    )


def test_a_siglum_is_not_an_identity():
    """Sigla are positional and reassigned on every run (`pv.siglum`). A paper that
    gains a finding earlier in document order must not orphan every amendment
    filed against the ones after it."""
    check = a_check([a_finding(siglum="a")])
    shifted = a_check([a_finding(siglum="q")])
    assert finding_fingerprint(check, check.findings[0]) == finding_fingerprint(
        shifted, shifted.findings[0]
    )


def test_rewriting_our_own_explanation_does_not_orphan_an_objection():
    """`explanation` is our sentence about the finding, not the finding. We have to
    be able to improve our prose without detaching an author's objection to the
    substance."""
    check = a_check()
    reworded = a_check([a_finding(explanation="A different sentence entirely.")])
    assert finding_fingerprint(check, check.findings[0]) == finding_fingerprint(
        reworded, reworded.findings[0]
    )


def test_a_downgraded_severity_is_a_different_judgement():
    """The review gate turns on severity, so a finding lowered from high to medium
    is not the finding that was contested."""
    high = a_check()
    medium = a_check([a_finding(severity=Severity.MEDIUM)])
    assert finding_fingerprint(high, high.findings[0]) != finding_fingerprint(
        medium, medium.findings[0]
    )


def test_two_findings_on_different_cells_do_not_collide():
    check = a_check(
        [
            a_finding(),
            a_finding(
                anchor=Anchor(kind="table_cell", dom_id="tab:main/r4/c3", human_locator="")
            ),
        ]
    )
    assert len(fingerprints_in(a_report([check]))) == 2


def test_locate_finding_returns_none_rather_than_raising():
    """None is a normal answer: it is what a stale permalink looks like after the
    check that produced the finding was improved."""
    assert locate_finding(a_report(), "0" * 64) is None


# --------------------------------------------------------------------------
# The store
# --------------------------------------------------------------------------


def test_history_is_oldest_first():
    store = AmendmentStore()
    store.append("run", Amendment(finding_fingerprint="a", author_statement="first"))
    store.append("run", Amendment(finding_fingerprint="b", author_statement="second"))
    assert [a.author_statement for a in store.history("run")] == ["first", "second"]


def test_superseding_appends_and_leaves_the_original_standing():
    """An amendment is someone else's words about us. A resolution is a new row;
    it never rewrites the objection it answers."""
    store = AmendmentStore()
    first = store.append(
        "run", Amendment(finding_fingerprint="a", author_statement="The table is right.")
    )
    store.supersede("run", first, status="resolved", resolution_note="Checked again.")

    history = store.history("run")
    assert len(history) == 2
    assert history[0].status == "open"
    assert history[0].resolution_note == ""
    assert history[1].status == "resolved"
    # The author's own words are carried forward, not dropped: a resolution that
    # lost them would show our answer without their question.
    assert history[1].author_statement == "The table is right."


def test_current_is_the_last_row_per_finding():
    store = AmendmentStore()
    first = store.append("run", Amendment(finding_fingerprint="a", author_statement="x"))
    store.supersede("run", first, status="withdrawn")
    store.append("run", Amendment(finding_fingerprint="b", author_statement="y"))

    current = store.current("run")
    assert set(current) == {"a", "b"}
    assert current["a"].status == "withdrawn"
    # Superseded in the view, not in storage.
    assert len(store.history("run")) == 3


def test_submitted_at_is_stamped_on_arrival():
    """When we received the statement, not whatever a client claimed."""
    store = AmendmentStore()
    stored = store.append("run", Amendment(finding_fingerprint="a", author_statement="x"))
    assert stored.submitted_at is not None


def test_runs_do_not_see_each_others_amendments():
    store = AmendmentStore()
    store.append("one", Amendment(finding_fingerprint="a", author_statement="x"))
    assert store.history("two") == []


# --------------------------------------------------------------------------
# The endpoints
# --------------------------------------------------------------------------


@pytest.fixture
def client(tmp_path):
    """The app with the network nailed shut and its own stores.

    Both egress points are stubbed rather than merely configured off, so this
    suite cannot regress into making requests without a test failing.
    """

    def forbidden(*args, **kwargs):
        raise AssertionError("this test tried to reach the network; runs here must be offline")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("pv.ingest.fetch._download", forbidden)
        mp.setattr("pv.adapters.http.HttpxClient", forbidden)
        mp.setenv("HTTP_BACKEND", "offline")
        mp.setattr(
            app_module,
            "settings",
            Settings(fixtures_dir=FIXTURES, offline=True, llm_enabled=False),
        )
        mp.setattr(app_module, "store", RunStore(max_runs=20))
        mp.setattr(app_module, "amendments", AmendmentStore())
        mp.setattr(app_module, "orchestrator", Orchestrator(MemoryStateStore()))
        mp.setattr(app_module.review, "suppressions_dir", tmp_path / "suppressions")
        mp.setattr(app_module.review, "_decisions", {})
        with TestClient(app_module.app) as c:
            yield c


def seed_run(check: CheckResult | None = None) -> tuple[str, str]:
    """A run holding one finding, without driving the pipeline.

    The validated corpus produces no `diverges` at all, so a suite about what
    happens when we accuse someone has to build the accusation itself. Same shape
    as `fixtures/reports/synthetic.json`, and the paper it describes does not
    exist.
    """
    check = check or a_check()
    record = app_module.store.create("0000.00000", [])
    record.append_check(check)
    return record.run_id, finding_fingerprint(check, check.findings[0])


def test_contesting_a_finding_records_it(client):
    run_id, fp = seed_run()
    response = client.post(
        f"/runs/{run_id}/amendments",
        json={
            "finding_fingerprint": fp,
            "author_statement": "The bolded cell is the best in its block; the block "
            "boundary is a \\specialrule the parser did not read.",
            "corrected_value": "87.4",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["finding_fingerprint"] == fp
    assert body["status"] == "open"
    assert body["corrected_value"] == "87.4"
    assert body["submitted_at"] is not None


def test_contesting_a_finding_that_is_not_in_this_run_is_a_404(client):
    run_id, _fp = seed_run()
    response = client.post(
        f"/runs/{run_id}/amendments",
        json={"finding_fingerprint": "0" * 64, "author_statement": "..."},
    )
    assert response.status_code == 404
    # §7: says what happened, names no fault.
    assert "may have changed" in response.json()["detail"]


def test_an_amendment_never_touches_the_finding_it_answers(client):
    """Append-only, at the level a reader can observe: the report says exactly what
    it said before."""
    run_id, fp = seed_run()
    before = client.get(f"/runs/{run_id}/report").json()["checks"]
    client.post(
        f"/runs/{run_id}/amendments",
        json={"finding_fingerprint": fp, "author_statement": "..."},
    )
    assert client.get(f"/runs/{run_id}/report").json()["checks"] == before


def test_the_report_carries_the_amendment_history(client):
    run_id, fp = seed_run()
    client.post(
        f"/runs/{run_id}/amendments",
        json={"finding_fingerprint": fp, "author_statement": "The table is right."},
    )
    report = client.get(f"/runs/{run_id}/report").json()
    assert [a["author_statement"] for a in report["amendments"]] == ["The table is right."]


def test_the_history_endpoint_is_oldest_first_and_carries_the_standing_view(client):
    run_id, fp = seed_run()
    for statement in ("first", "second"):
        client.post(
            f"/runs/{run_id}/amendments",
            json={"finding_fingerprint": fp, "author_statement": statement},
        )
    body = client.get(f"/runs/{run_id}/amendments").json()
    assert [a["author_statement"] for a in body["amendments"]] == ["first", "second"]
    assert body["current"][fp]["author_statement"] == "second"


def test_the_history_of_a_run_we_never_issued_is_a_404(client):
    assert client.get("/runs/nope/amendments").status_code == 404


def test_the_finding_index_keys_a_fingerprint_to_the_row_that_renders_it(client):
    """The frontend needs the identity of what a Contest button is contesting, and
    `Finding` carries no fingerprint on the contract. Deriving it a second time in
    TypeScript is how this codebase ended up with two LaTeX modules; it is served
    from the one Python implementation instead."""
    run_id, fp = seed_run()
    body = client.get(f"/runs/{run_id}/findings").json()
    assert body["fingerprints"] == [fp]
    assert body["by_row"] == {"tab:main/r2/c3:bold_extreme": fp}


def test_an_ambiguous_row_key_is_omitted_rather_than_guessed(client):
    """Two findings sharing a dom_id and a checker cannot be told apart by the row
    key. Resolving it to either would let a Contest button attach an author's
    statement to the wrong finding — so the key is dropped and both fingerprints
    stay listed."""
    check = a_check([a_finding(), a_finding(claimed="90.1", computed="88.0")])
    run_id, _fp = seed_run(check)
    body = client.get(f"/runs/{run_id}/findings").json()
    assert len(body["fingerprints"]) == 2
    assert body["by_row"] == {}


def test_rechecking_without_an_amendment_is_a_404(client):
    run_id, fp = seed_run()
    assert client.post(f"/runs/{run_id}/amendments/{fp}/recheck").status_code == 404


# --------------------------------------------------------------------------
# Recheck (§14.5)
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def driven_run():
    """A real run over a real fixture paper, offline, with its own orchestrator.

    `row_arithmetic` on the BERT paper produces the GLUE average finding. It is
    `within_tolerance`, not `diverges` — the corpus contains no divergence — which
    is fine here: a recheck is about re-running a claim, not about its verdict.

    Module-scoped, and shared safely: a recheck never writes into the run, which
    `test_a_recheck_writes_no_verdict_into_the_run` asserts. Checking a real paper
    costs about a second, and five of them is the difference between a suite
    people run and a suite people skip.
    """

    def forbidden(*args, **kwargs):
        raise AssertionError("this test tried to reach the network; runs here must be offline")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("pv.ingest.fetch._download", forbidden)
        mp.setattr("pv.adapters.http.HttpxClient", forbidden)
        mp.setenv("HTTP_BACKEND", "offline")
        orchestrator = Orchestrator(MemoryStateStore())
        run_id = orchestrator.start(
            PAPER_WITH_A_FINDING,
            opts=RunOptions(
                checks=("row_arithmetic",),
                from_directory=str(FIXTURES / PAPER_WITH_A_FINDING),
                allow_network=False,
            ),
        )
        orchestrator.drive(run_id)
        state = orchestrator.state(run_id)
        check = state.results[0]
        assert check.findings, "the BERT fixture should produce the GLUE average finding"
        yield orchestrator, run_id, finding_fingerprint(check, check.findings[0])


def test_an_unchanged_checker_is_a_cache_hit_and_executes_nothing(driven_run):
    """§14.5's invariant: verdict = f(claim, checker_version, policy_version,
    artifact_commit). Nothing has moved, so the stored row *is* the answer, and
    reporting that we re-ran it would be a claim about work we did not do."""
    orchestrator, run_id, fp = driven_run
    outcome = recheck_finding(orchestrator, run_id, fp)
    assert outcome.executed is False
    assert outcome.still_found is True
    assert outcome.current_finding_fingerprint == fp
    assert "has not changed" in outcome.note


def test_a_bumped_checker_is_a_miss_and_runs_exactly_one_check(driven_run, monkeypatch):
    """A checker improved since the run is the case a recheck exists for. One
    check runs — over the document the run already holds, so nothing is fetched
    and nothing is re-parsed."""
    orchestrator, run_id, fp = driven_run
    from pv.checks import row_arithmetic

    monkeypatch.setattr(row_arithmetic, "CHECKER_VERSION", "99", raising=False)
    outcome = recheck_finding(orchestrator, run_id, fp)

    assert outcome.executed is True
    assert outcome.result is not None
    assert outcome.result.checker_version == "99"


def test_a_recheck_writes_no_verdict_into_the_run(driven_run, monkeypatch):
    """The run is the record of what we found when we looked. A second look is a
    separate event and must stay legible as one."""
    orchestrator, run_id, fp = driven_run
    before = orchestrator.state(run_id).model_dump_json()

    from pv.checks import row_arithmetic

    monkeypatch.setattr(row_arithmetic, "CHECKER_VERSION", "99", raising=False)
    recheck_finding(orchestrator, run_id, fp)

    assert orchestrator.state(run_id).model_dump_json() == before


def test_a_version_bump_alone_is_not_reported_as_clearing_the_finding(
    driven_run, monkeypatch
):
    """The worst available failure mode: an author told their paper is fine because
    we renumbered a checker. `still_found` is matched on the comparison, never on
    the fingerprint, which a version bump changes by construction."""
    orchestrator, run_id, fp = driven_run
    from pv.checks import row_arithmetic

    monkeypatch.setattr(row_arithmetic, "CHECKER_VERSION", "99", raising=False)
    outcome = recheck_finding(orchestrator, run_id, fp)

    assert outcome.still_found is True
    assert outcome.current_finding_fingerprint is not None
    # The judgement has a new identity even though the comparison is the same.
    assert outcome.current_finding_fingerprint != fp


def test_rechecking_a_fingerprint_this_run_never_produced_raises(driven_run):
    orchestrator, run_id, _fp = driven_run
    with pytest.raises(FindingNotInRun):
        recheck_finding(orchestrator, run_id, "0" * 64)
