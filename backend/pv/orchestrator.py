"""The run state machine (§14.2) and the single implementation of the pipeline (§14.6).

Before this module there were two stage walks: `run.run_paper` for the CLI and
`api/jobs.execute` for the stream. Two implementations of one pipeline is how the
CLI and the API come to disagree about what a paper says — the same lossy-reading
defect this codebase keeps producing (CLAUDE.md), one layer up. There is now one
pipeline and two drivers:

    run.run_paper      start, then advance until terminal, return the report
    api.jobs.execute   the same, awaiting each advance and publishing after it

The states, and the only legal transitions between them:

    queued -> resolving -> extracting -> mining -> awaiting_artifact -> planning
           -> checking -> adjudicating -> complete
                                       \\-> partial
           \\-> failed   (only from resolving or extracting)

`failed` is reserved for the two stages where there is genuinely nothing to show:
no source, or source we could not parse. Once extraction succeeds every outcome is
`complete` or `partial`. That is already how `run_paper` behaved; this gives it a
name and a persisted record.

`partial` means something *prevented* us from finishing — a checker raised, a stage
timed out, a service was unreachable. It does not mean the paper had nothing to
check. A run whose every check comes back `unverifiable / metric_direction_unknown`
is `complete`: we did all the work there was, and the answer is that we decline to
judge. Honest incompleteness is the product (CLAUDE.md), so it must not be filed
under the same word as infrastructure failure.

**`advance` executes exactly one unit of work**, persists, and returns. That is what
makes it resumable — a process that dies mid-run leaves a state whose next `advance`
picks up at the check that had not run yet — and it is what lets the async driver
publish a result the moment it lands instead of at the end.

Nothing in here calls a model.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Callable, Protocol

from pydantic import BaseModel, Field

from .checks import registry
from .ingest import ingest, ingest_directory
from .siglum import assign as assign_sigla
from .models import (
    Artifact,
    CheckContext,
    CheckResult,
    Claim,
    NotChecked,
    ReasonCode,
    RunReport,
    SourceDocument,
    Table,
    Verdict,
)
from .parse import parse_document

RunId = str

DEFAULT_CHECKS: tuple[str, ...] = ("bold_extreme", "row_arithmetic", "links", "citations")

# §14.2: a run must never block indefinitely on a human.
DEFAULT_ARTIFACT_TIMEOUT_SECONDS = 600.0

# §14.7: a stage that never returns is a stage that never reports. Generous enough
# that no honest check hits it, short enough that a wedged one does not hold a run.
DEFAULT_STAGE_TIMEOUT_SECONDS = 300.0

# Reason codes that mean "we could not do the work", as distinct from "we did the
# work and the answer is that we cannot judge". Only the first kind makes a run
# `partial`; see the module docstring.
_INFRASTRUCTURE_REASONS = frozenset(
    {
        ReasonCode.CHECKER_ERROR,
        ReasonCode.NETWORK_ERROR,
        ReasonCode.RATE_LIMITED,
    }
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RunStage(str, Enum):
    """§14.2. Persisted, so a run survives a restart."""

    QUEUED = "queued"
    RESOLVING = "resolving"
    EXTRACTING = "extracting"
    MINING = "mining"
    AWAITING_ARTIFACT = "awaiting_artifact"
    PLANNING = "planning"
    CHECKING = "checking"
    ADJUDICATING = "adjudicating"
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"


TERMINAL_STAGES = frozenset({RunStage.COMPLETE, RunStage.PARTIAL, RunStage.FAILED})


class RunNotFound(LookupError):
    """No run with that id in this store."""


class RunNotWaiting(RuntimeError):
    """`confirm_artifact` arrived for a run that is not in `awaiting_artifact`.

    Usually the ten-minute window closed first. The run is not broken — it took
    the "continue without code" path, which §5.2 calls legitimate — so this is a
    conflict, not an error about the paper.
    """


class RunOptions(BaseModel):
    """Everything a run needs that is not the paper itself.

    `id_error` is set by the driver, not discovered here: the API normalises the
    submitted identifier at the endpoint because the run id and manifest are
    issued before the run starts. A malformed identifier is not a paper that
    shipped no LaTeX, and §5.5 reads very differently for the two.
    """

    checks: tuple[str, ...] = DEFAULT_CHECKS
    # An on-disk source tree. Set, nothing touches the network during ingest.
    from_directory: str | None = None
    allow_network: bool = True
    llm_enabled: bool = False
    id_error: str | None = None
    # Pause in `awaiting_artifact` for the §5.2 confirmation screen. Off by
    # default: the CLI has no human to ask, and a run that pauses by default is a
    # run that hangs.
    await_artifact: bool = False
    artifact_timeout_s: float = DEFAULT_ARTIFACT_TIMEOUT_SECONDS
    stage_timeout_s: float | None = DEFAULT_STAGE_TIMEOUT_SECONDS


class RunState(BaseModel):
    """One run, in full, at rest.

    Serialisable by construction: every field is a contract model or a scalar, so
    the whole thing round-trips through JSON and a run can be resumed by a process
    that never saw it start. When Postgres arrives this is the row.
    """

    run_id: RunId
    arxiv_id: str
    stage: RunStage = RunStage.QUEUED
    options: RunOptions = Field(default_factory=RunOptions)

    title: str = ""
    started_at: datetime | None = None
    updated_at: datetime | None = None
    finished_at: datetime | None = None

    document: SourceDocument | None = None
    # Every parsed tabular, including nested ones. `collect_not_checked` needs the
    # full list to decide which omissions to report; `tables_parsed` does not.
    tables: list[Table] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)

    artifact: Artifact | None = None
    artifact_candidates: list[Artifact] = Field(default_factory=list)
    artifact_confirmed: bool = False
    artifact_deadline: datetime | None = None
    artifact_timed_out: bool = False

    # Check module names, in execution order. `len(results)` is the cursor into it.
    plan: list[str] = Field(default_factory=list)
    results: list[CheckResult] = Field(default_factory=list)
    # Accumulated during the run — mining failures, the artifact timeout. Replaced
    # by the full list at adjudication.
    not_checked: list[NotChecked] = Field(default_factory=list)

    @property
    def is_terminal(self) -> bool:
        return self.stage in TERMINAL_STAGES

    @property
    def checkable_tables(self) -> list[Table]:
        """A tabular nested in another table's cell is a line-break helper, not
        data. The checks never see one, and it never counts towards
        `tables_parsed` — a paper whose real content is four tables should not
        report eleven."""
        return [t for t in self.tables if not t.is_nested]

    @property
    def tables_parsed(self) -> int:
        return len(self.checkable_tables)

    @property
    def is_awaiting_artifact(self) -> bool:
        """Actually paused on the §5.2 screen, as opposed to merely passing
        through the stage.

        Every run enters `awaiting_artifact`; almost none of them stop there. A
        driver that treats arrival as a pause announces a decision nobody was
        asked to make, so the deadline — set only when there is something to
        confirm — is what "waiting" means.
        """
        return (
            self.stage is RunStage.AWAITING_ARTIFACT
            and self.artifact_deadline is not None
            and not self.artifact_confirmed
        )

    def seconds_until_artifact_deadline(self, now: datetime | None = None) -> float:
        """How long a driver may sleep before asking again. 0 when there is
        nothing to wait for."""
        if not self.is_awaiting_artifact or self.artifact_deadline is None:
            return 0.0
        return max(0.0, (self.artifact_deadline - (now or _now())).total_seconds())


# --------------------------------------------------------------------------
# Persistence. Two implementations behind one interface, selected by env var —
# the local/hosted rule from CLAUDE.md, not `if LOCAL:` at the call sites.
# --------------------------------------------------------------------------


class StateStore(Protocol):
    def load(self, run_id: RunId) -> RunState | None: ...
    def save(self, state: RunState) -> None: ...
    def ids(self) -> list[RunId]: ...


class MemoryStateStore:
    """Process-local. Fine for the CLI, which starts and finishes in one process."""

    def __init__(self) -> None:
        self._states: dict[RunId, RunState] = {}

    def load(self, run_id: RunId) -> RunState | None:
        return self._states.get(run_id)

    def save(self, state: RunState) -> None:
        self._states[state.run_id] = state

    def ids(self) -> list[RunId]:
        return list(self._states)


class FileStateStore:
    """One JSON document per run under `PV_STATE_DIR`.

    This is what makes "resumable after a restart" true rather than aspirational
    while Postgres does not exist. Writes go through a temporary file and a rename
    so a process killed mid-write leaves the previous state intact rather than a
    truncated one — a half-written state would resume into a wrong report, which
    is worse than not resuming at all.
    """

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def _path(self, run_id: RunId) -> Path:
        return self.directory / f"{run_id}.json"

    def load(self, run_id: RunId) -> RunState | None:
        try:
            payload = self._path(run_id).read_text(encoding="utf-8")
        except OSError:
            return None
        try:
            return RunState.model_validate_json(payload)
        except ValueError:
            # A state written by an older schema. Refusing to resume is right:
            # resuming into a half-understood record invents a report.
            return None

    def save(self, state: RunState) -> None:
        path = self._path(state.run_id)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(state.model_dump_json(), encoding="utf-8")
            tmp.replace(path)
        except OSError:
            # A state that cannot be persisted is a run that cannot be resumed,
            # not a run that failed.
            pass

    def ids(self) -> list[RunId]:
        try:
            return sorted(p.stem for p in self.directory.glob("*.json"))
        except OSError:
            return []


def default_state_store() -> StateStore:
    """`PV_STATE_DIR` selects the durable store. Unset, runs live in memory."""
    directory = os.getenv("PV_STATE_DIR", "").strip()
    return FileStateStore(directory) if directory else MemoryStateStore()


# --------------------------------------------------------------------------
# Claim mining. `pv.claims.mine` is Agent H's; this is the narrow seam it lands
# behind, so the orchestrator ships without waiting for it — the same way the
# checks were built against the model before the parser existed.
# --------------------------------------------------------------------------

Miner = Callable[[SourceDocument, list[Table]], list[Claim]]


def load_miner() -> Miner | None:
    """`mine(document, tables) -> list[Claim]` (§14.3), or None if not landed yet.

    Absent, the mining stage produces no claims and `CheckContext.claims` stays
    empty — exactly what every checker sees today, so the corpus output cannot
    move on the strength of this module existing or not.
    """
    try:
        from .claims.mine import mine  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001 — absent or half-written, both mean "not yet".
        return None
    return mine if callable(mine) else None


# --------------------------------------------------------------------------
# Aggregation. Moved here from `run.py` unchanged: it is already correct and
# already shared between the drivers, it just had no home (§14.6).
# --------------------------------------------------------------------------


def _table_name(table: Table) -> str:
    return table.label or table.caption[:48] or table.anchor.dom_id


def collect_not_checked(
    document: SourceDocument, tables: list[Table], results: list[CheckResult]
) -> list[NotChecked]:
    """Everything the run could not verify, with the specific reason.

    Three sources, none of which any single check can report on its own:
    the ingest stage, tables that failed to parse, and checks that declined.
    """
    out: list[NotChecked] = []

    # 1. Ingest fell short — e.g. a PDF-only submission with no LaTeX at all.
    if document.ingest_reason is not None:
        out.append(
            NotChecked(
                what=f"Source for {document.arxiv_id}",
                reason=document.ingest_reason,
                detail=document.ingest_detail,
            )
        )

    # 2. Tables the parser could not fully resolve. A check that evaluated three
    # tables and skipped a fourth still reports `matches`; the fourth lands here.
    # Nested tabulars are line-break helpers, not data — reporting them as
    # unparsed would fill the section with noise the user cannot act on.
    for table in tables:
        if table.is_nested:
            continue
        if table.parse_warnings:
            out.append(
                NotChecked(
                    what=f"Table {_table_name(table)}",
                    reason=ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
                    detail="; ".join(table.parse_warnings[:3]),
                )
            )

    # 3. Checks that declined outright. `detail` stays empty rather than echoing
    # the check's description: §5.5 asks for the specific reason something could
    # not be verified, and restating what the check does answers a different
    # question. The reason code carries the meaning; the UI renders its label.
    for res in results:
        if res.verdict is Verdict.UNVERIFIABLE and res.reason is not None:
            out.append(NotChecked(what=res.display_name or res.checker, reason=res.reason))
        elif res.verdict is Verdict.NOT_ATTEMPTED:
            out.append(
                NotChecked(
                    what=res.display_name or res.checker,
                    reason=res.reason or ReasonCode.NO_APPLICABLE_CLAIMS,
                )
            )

    return out


# --------------------------------------------------------------------------
# The orchestrator
# --------------------------------------------------------------------------


class Orchestrator:
    """Owns the §14.2 state machine. The only implementation of the pipeline."""

    def __init__(self, store: StateStore | None = None) -> None:
        self.store: StateStore = store if store is not None else default_state_store()

    # -- lifecycle --------------------------------------------------------

    def start(self, arxiv_id: str, *, opts: RunOptions | None = None,
              run_id: RunId | None = None) -> RunId:
        """Register a run in `queued`. Does no work — `advance` does the work.

        `run_id` is accepted so the API can issue an id (and therefore a manifest
        and a permalink) before the first stage runs.
        """
        state = RunState(
            run_id=run_id or uuid.uuid4().hex,
            arxiv_id=arxiv_id,
            options=opts or RunOptions(),
            started_at=_now(),
            updated_at=_now(),
        )
        self.store.save(state)
        return state.run_id

    def state(self, run_id: RunId) -> RunState:
        state = self.store.load(run_id)
        if state is None:
            raise RunNotFound(run_id)
        return state

    def advance(self, run_id: RunId) -> RunState:
        """Execute the next stage, persist, emit events. Idempotent and resumable.

        Exactly one unit of work per call: one ingest, one parse, one check. A
        terminal run advances to itself, so a driver that calls once more than it
        needed to does no harm and produces no second report.
        """
        state = self.state(run_id)
        if state.is_terminal:
            return state

        handler = _HANDLERS[state.stage]
        handler(self, state)

        state.updated_at = _now()
        if state.is_terminal and state.finished_at is None:
            state.finished_at = state.updated_at
        self.store.save(state)
        return state

    def drive(self, run_id: RunId, *, max_steps: int = 10_000) -> RunState:
        """Advance to a terminal stage. The synchronous driver's whole body.

        Blocks in `awaiting_artifact` only as long as its deadline: the wait is a
        real sleep, so this is not the path the API takes — it awaits instead.
        """
        state = self.state(run_id)
        for _ in range(max_steps):
            if state.is_terminal:
                return state
            if state.is_awaiting_artifact:
                remaining = state.seconds_until_artifact_deadline()
                if remaining > 0:
                    _sleep(min(remaining, 0.25))
            state = self.advance(run_id)
        return state

    def confirm_artifact(self, run_id: RunId, artifact: Artifact | None) -> None:
        """Record the §5.2 choice. `None` is "continue without code" — a normal
        answer, not a refusal, and it releases the run exactly as a repository does."""
        state = self.state(run_id)
        if not state.is_awaiting_artifact:
            raise RunNotWaiting(
                f"Run {run_id} is not waiting for a repository (it is {state.stage.value})."
            )
        state.artifact = artifact
        state.artifact_confirmed = True
        state.updated_at = _now()
        self.store.save(state)

    # -- reads ------------------------------------------------------------

    def report(self, run_id: RunId) -> RunReport:
        """The contract type, whatever stage the run is at. Mid-run this is a
        partial report: the checks that have finished, and nothing invented for
        the ones that have not."""
        state = self.state(run_id)
        checkable = state.checkable_tables
        report = RunReport(
            arxiv_id=state.arxiv_id,
            title=state.title,
            checks=list(state.results),
            not_checked=list(state.not_checked),
            tables=checkable,
            tables_parsed=len(checkable),
            started_at=state.started_at,
            finished_at=state.finished_at,
        )
        # Sigla are assigned here rather than by a checker, because a mark is only
        # meaningful once the whole report exists: it numbers rows across every
        # check and then continues through the not-checked list. Assigning it
        # per check would restart the sequence and give two rows the same mark.
        #
        # A partial report gets partial sigla, and a row's mark can move as later
        # checks land. That is correct: a siglum is navigation within one reading
        # of one report, not identity. `fingerprint` is what survives.
        return assign_sigla(report)

    def manifest_names(self, run_id: RunId) -> list[str]:
        """The check names this run intends to execute. Known before planning
        because `RunOptions.checks` is the plan — planning only resolves it."""
        state = self.state(run_id)
        return state.plan or list(state.options.checks)

    # -- stages -----------------------------------------------------------

    def _stage_queued(self, state: RunState) -> None:
        state.stage = RunStage.RESOLVING

    def _stage_resolving(self, state: RunState) -> None:
        opts = state.options
        if opts.id_error is not None:
            # A malformed identifier, not a real paper that shipped no LaTeX. The
            # two read very differently in §5.5, so they get different codes.
            _fail(state, ReasonCode.INVALID_PAPER_ID, opts.id_error,
                  what=f"Paper {state.arxiv_id}")
            return

        try:
            if opts.from_directory is not None:
                result = ingest_directory(opts.from_directory, arxiv_id=state.arxiv_id)
            else:
                result = ingest(state.arxiv_id, allow_network=opts.allow_network)
        except Exception as exc:  # noqa: BLE001 — §14.7: every failure has a code.
            _fail(state, ReasonCode.NETWORK_ERROR,
                  f"The source could not be retrieved: {type(exc).__name__}.",
                  what=f"Source for {state.arxiv_id}")
            return

        document = result.document
        state.title = document.title
        if not result.ok and not document.assembled_latex:
            # Nothing to work with. Still a valid report — it just says so.
            _fail(state, result.reason or ReasonCode.NO_LATEX_SOURCE, result.detail,
                  what=f"Source for {state.arxiv_id}")
            return

        state.document = document
        state.stage = RunStage.EXTRACTING

    def _stage_extracting(self, state: RunState) -> None:
        assert state.document is not None
        try:
            state.tables = parse_document(state.document)
        except Exception as exc:  # noqa: BLE001
            _fail(state, ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
                  f"The source could not be parsed: {type(exc).__name__}.",
                  what=f"Tables in {state.arxiv_id}")
            return
        state.stage = RunStage.MINING

    def _stage_mining(self, state: RunState) -> None:
        assert state.document is not None
        miner = load_miner()
        if miner is not None:
            try:
                state.claims = list(miner(state.document, state.checkable_tables))
            except Exception as exc:  # noqa: BLE001 — mining never fails a run.
                state.claims = []
                state.not_checked.append(
                    NotChecked(
                        what="Claim mining",
                        reason=ReasonCode.CHECKER_ERROR,
                        detail=f"Claims could not be mined: {type(exc).__name__}.",
                    )
                )
        state.stage = RunStage.AWAITING_ARTIFACT

    def _stage_awaiting_artifact(self, state: RunState) -> None:
        """§5.2's confirmation screen, and the state it needs to live in.

        The run never blocks indefinitely: on expiry it proceeds with
        `artifact = None`, which is the same "continue without code" path §5.2
        already calls legitimate — taken automatically instead of by a click.
        """
        if not state.options.await_artifact:
            state.stage = RunStage.PLANNING
            return

        if state.artifact_confirmed:
            state.stage = RunStage.PLANNING
            return

        if state.artifact_deadline is None:
            state.artifact_candidates = _repository_candidates(state.document)
            if not state.artifact_candidates:
                # Nothing to confirm. A paper with no repository is a normal
                # paper; there is no question to put to anyone.
                state.stage = RunStage.PLANNING
                return
            state.artifact_deadline = _now() + timedelta(seconds=state.options.artifact_timeout_s)
            return  # stay in awaiting_artifact; the driver waits or the user answers

        if _now() >= state.artifact_deadline:
            state.artifact = None
            state.artifact_timed_out = True
            state.stage = RunStage.PLANNING

    def _stage_planning(self, state: RunState) -> None:
        # `discover` returns one entry per name, so the plan is the request. A
        # name that does not resolve still produces a row (registry.MissingChecker).
        state.plan = list(state.options.checks)
        state.stage = RunStage.CHECKING

    def _stage_checking(self, state: RunState) -> None:
        index = len(state.results)
        if index >= len(state.plan):
            state.stage = RunStage.ADJUDICATING
            return

        name = state.plan[index]
        assert state.document is not None
        ctx = CheckContext(
            document=state.document,
            tables=state.checkable_tables,
            claims=state.claims,
            llm_enabled=state.options.llm_enabled,
        )
        module = registry.discover((name,))[0]
        state.results.append(_run_check(module, ctx, state.options.stage_timeout_s))

        if len(state.results) >= len(state.plan):
            state.stage = RunStage.ADJUDICATING

    def _stage_adjudicating(self, state: RunState) -> None:
        assert state.document is not None
        carried = list(state.not_checked)
        state.not_checked = collect_not_checked(state.document, state.tables, state.results)

        if state.artifact_timed_out:
            carried.append(
                NotChecked(
                    what="Code repository",
                    reason=ReasonCode.NO_CODE_REPOSITORY,
                    # §7: name what the reader can act on, not the mechanism.
                    detail="No repository was confirmed, so the run continued without code.",
                )
            )
        state.not_checked.extend(carried)

        state.stage = RunStage.PARTIAL if _is_partial(state) else RunStage.COMPLETE

    _HANDLER_NAMES = {
        RunStage.QUEUED: "_stage_queued",
        RunStage.RESOLVING: "_stage_resolving",
        RunStage.EXTRACTING: "_stage_extracting",
        RunStage.MINING: "_stage_mining",
        RunStage.AWAITING_ARTIFACT: "_stage_awaiting_artifact",
        RunStage.PLANNING: "_stage_planning",
        RunStage.CHECKING: "_stage_checking",
        RunStage.ADJUDICATING: "_stage_adjudicating",
    }


_HANDLERS: dict[RunStage, Callable[[Orchestrator, RunState], None]] = {
    stage: getattr(Orchestrator, attr) for stage, attr in Orchestrator._HANDLER_NAMES.items()
}


# --------------------------------------------------------------------------
# Stage helpers
# --------------------------------------------------------------------------


def _fail(state: RunState, reason: ReasonCode, detail: str, *, what: str) -> None:
    """Terminate in `failed` with a report that says why.

    Reachable only from `resolving` and `extracting` (§14.2). A failed run still
    produces a `RunReport`: §5.5 carries the reason and the UI shows it as "not
    checked". There is no 500 for a paper we could not read.
    """
    state.not_checked = [NotChecked(what=what, reason=reason, detail=detail)]
    state.stage = RunStage.FAILED


def _is_partial(state: RunState) -> bool:
    """True when something prevented the run from finishing its plan.

    Not "the paper had nothing to check" — that is a complete run with an honest
    answer. See the module docstring.
    """
    if len(state.results) < len(state.plan):
        return True
    if state.artifact_timed_out:
        return True
    return any(res.reason in _INFRASTRUCTURE_REASONS for res in state.results)


def _run_check(module, ctx: CheckContext, timeout_s: float | None) -> CheckResult:
    """One check, with a wall-clock budget (§14.7).

    `registry.run_check` already converts a check that *raises* into
    `unverifiable / checker_error`. A check that never returns is the case it
    cannot cover, because there is no exception to catch: without a budget one
    wedged request holds the run open forever. On expiry the check reports
    `unverifiable / checker_error` with the elapsed time and the run continues —
    the same shape as a raise, which is what it is from the outside.
    """
    if timeout_s is None:
        return registry.run_check(module, ctx)

    box: dict[str, object] = {}

    def _worker() -> None:
        try:
            box["result"] = registry.run_check(module, ctx)
        except BaseException as exc:  # noqa: BLE001 — carried across the boundary
            box["error"] = exc

    name = getattr(module, "CHECKER_NAME", getattr(module, "__name__", "check"))
    thread = threading.Thread(target=_worker, name=f"pv-check-{name}", daemon=True)
    thread.start()
    thread.join(timeout_s)

    if thread.is_alive():
        # Abandoned, not killed: Python cannot interrupt a thread. It is a daemon,
        # so it cannot hold the process open, and its result is discarded if it
        # ever arrives — a result we already reported as unfinished must not
        # reappear and contradict the report.
        return CheckResult(
            checker=name,
            checker_version=getattr(module, "CHECKER_VERSION", "0"),
            verdict=Verdict.UNVERIFIABLE,
            reason=ReasonCode.CHECKER_ERROR,
            display_name=getattr(module, "DISPLAY_NAME", ""),
            description=f"This check did not finish within {timeout_s:.0f} seconds.",
            duration_ms=int(timeout_s * 1000),
            created_at=_now(),
        )

    error = box.get("error")
    if error is not None:
        return CheckResult(
            checker=name,
            checker_version=getattr(module, "CHECKER_VERSION", "0"),
            verdict=Verdict.UNVERIFIABLE,
            reason=ReasonCode.CHECKER_ERROR,
            display_name=getattr(module, "DISPLAY_NAME", ""),
            description=f"This check could not be completed: {type(error).__name__}.",
            created_at=_now(),
        )

    result = box.get("result")
    assert isinstance(result, CheckResult)
    return result


def _repository_candidates(document: SourceDocument | None) -> list[Artifact]:
    """§5.2 candidates, deterministically and without a request.

    Metadata (stars, last commit) is a separate GitHub call against a 60/hour
    unauthenticated budget, and the confirmation screen is usable without it —
    the API enriches when it can. An import failure here must not fail a run.
    """
    if document is None:
        return []
    try:
        from .checks.repos import find_repository_candidates

        return find_repository_candidates(document)
    except Exception:  # noqa: BLE001
        return []


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


# --------------------------------------------------------------------------
# Process-wide default, so the API's endpoints and its background jobs address
# the same runs. One object, one state store, no module-level branching.
# --------------------------------------------------------------------------

_default: Orchestrator | None = None


def get_orchestrator() -> Orchestrator:
    global _default
    if _default is None:
        _default = Orchestrator()
    return _default


def reset_orchestrator(orchestrator: Orchestrator | None = None) -> Orchestrator:
    """Replace the process default. For tests and for a worker that wants its own."""
    global _default
    _default = orchestrator if orchestrator is not None else Orchestrator()
    return _default


__all__ = [
    "DEFAULT_ARTIFACT_TIMEOUT_SECONDS",
    "DEFAULT_CHECKS",
    "DEFAULT_STAGE_TIMEOUT_SECONDS",
    "FileStateStore",
    "MemoryStateStore",
    "Orchestrator",
    "RunId",
    "RunNotFound",
    "RunNotWaiting",
    "RunOptions",
    "RunStage",
    "RunState",
    "StateStore",
    "TERMINAL_STAGES",
    "collect_not_checked",
    "default_state_store",
    "get_orchestrator",
    "load_miner",
    "reset_orchestrator",
]
