"""In-memory run store. Append-only, like the schema it stands in for (§10).

Docker is not installed, so there is no Postgres yet. This holds the same shape
the `runs` / `checks` / `not_checked` tables will hold, with the same rule: a
check result is appended once and never mutated. When Postgres arrives, this file
is replaced by a repository with the same three methods, and nothing above it
changes.

It is also the fan-out point for SSE. A subscriber gets a replay of everything
that has already landed, then live events — so a client that connects late, or
reconnects, sees the whole run rather than the tail of it. That is only possible
because the log is append-only.
"""

from __future__ import annotations

import asyncio
import uuid
from collections import OrderedDict
from datetime import datetime, timezone

from ..models import Artifact, CheckResult, NotChecked, RunReport
from ..orchestrator import RunStage
from .schemas import (
    CheckEvent,
    DoneEvent,
    Run,
    RunManifest,
    RunStatus,
    RunSummary,
    StateEvent,
    StreamEvent,
    VerdictCounts,
)

Event = tuple[StreamEvent, CheckEvent | DoneEvent | RunManifest | StateEvent]

# The coarse status the run list renders, derived from the §14.2 state. `failed`
# and `partial` map to `complete` on purpose: both produced a report, and §5.5's
# job is to say what is in it. A run does not fail; a paper we could not check is
# a report saying so.
_TERMINAL_STAGES = {RunStage.COMPLETE, RunStage.PARTIAL, RunStage.FAILED}


def _status_for(stage: RunStage) -> RunStatus:
    if stage in _TERMINAL_STAGES:
        return RunStatus.COMPLETE
    if stage is RunStage.QUEUED:
        return RunStatus.QUEUED
    return RunStatus.RUNNING


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RunRecord:
    """One run. The `checks` list only ever grows."""

    def __init__(self, run_id: str, arxiv_id: str, manifest: RunManifest) -> None:
        self.run_id = run_id
        self.arxiv_id = arxiv_id
        self.manifest = manifest
        self.title = ""
        self.status = RunStatus.QUEUED
        self.stage = RunStage.QUEUED
        self.started_at: datetime | None = None
        self.finished_at: datetime | None = None
        self.tables_parsed = 0
        self.checks: list[CheckResult] = []
        self.not_checked: list[NotChecked] = []
        self.artifact_candidates: list[Artifact] = []
        self.artifact: Artifact | None = None
        self.artifact_deadline: datetime | None = None
        self._subscribers: list[asyncio.Queue[Event | None]] = []

    # -- reads ------------------------------------------------------------

    def report(self) -> RunReport:
        """The contract type, whatever stage the run is at. Mid-run this is a
        partial report: the checks that have finished, and nothing invented for
        the ones that have not."""
        return RunReport(
            arxiv_id=self.arxiv_id,
            title=self.title,
            checks=list(self.checks),
            not_checked=list(self.not_checked),
            tables_parsed=self.tables_parsed,
            started_at=self.started_at,
            finished_at=self.finished_at,
        )

    def envelope(self) -> Run:
        return Run(
            run_id=self.run_id,
            arxiv_id=self.arxiv_id,
            status=self.status,
            state=self.stage,
            manifest=self.manifest,
            report=self.report(),
            artifact_candidates=list(self.artifact_candidates),
            artifact=self.artifact,
        )

    def elapsed_seconds(self) -> float | None:
        """Wall clock, against this process's clock rather than a browser's.

        Runs to `finished_at` once there is one, so a finished run reports a
        fixed duration rather than a number that keeps climbing. Null before the
        run starts: zero would be a claim that it started and took no time.
        """
        if self.started_at is None:
            return None
        end = self.finished_at or _now()
        return max((end - self.started_at).total_seconds(), 0.0)

    def summary(self) -> RunSummary:
        """The list row. Everything `DASHBOARD.md` renders, from this record only.

        `held_findings` and `held_amendments` are **not** filled here. They are
        the review gate's answer, not the run's, and this record has no business
        knowing about the gate — the same separation `_report_with_amendments`
        keeps for the amendment log. `pv.api.app.list_runs` joins them on.
        """
        return RunSummary(
            run_id=self.run_id,
            arxiv_id=self.arxiv_id,
            title=self.title,
            status=self.status,
            state=self.stage,
            started_at=self.started_at,
            finished_at=self.finished_at,
            elapsed_seconds=self.elapsed_seconds(),
            tables_parsed=self.tables_parsed,
            verdicts=[c.verdict for c in self.checks],
            counts=VerdictCounts.of(
                (c.verdict for c in self.checks), not_checked=len(self.not_checked)
            ),
            findings=sum(len(c.findings) for c in self.checks),
            not_checked=len(self.not_checked),
        )

    # -- writes -----------------------------------------------------------

    def start(self, title: str = "") -> None:
        self.status = RunStatus.RUNNING
        self.stage = RunStage.RESOLVING if self.stage is RunStage.QUEUED else self.stage
        self.started_at = self.started_at or _now()
        if title:
            self.title = title

    def await_artifact(
        self, candidates: list[Artifact], deadline: datetime | None = None
    ) -> None:
        """Enter the §5.2 pause and say so, once.

        Published only on entry: the driver polls this state, and one event per
        poll would be a stream that says the same thing three hundred times while
        nothing happens.
        """
        if self.stage is RunStage.AWAITING_ARTIFACT:
            return
        self.stage = RunStage.AWAITING_ARTIFACT
        self.artifact_candidates = list(candidates)
        self.artifact_deadline = deadline
        self._publish(
            (
                StreamEvent.STATE,
                StateEvent(
                    run_id=self.run_id,
                    state=self.stage,
                    artifact_candidates=list(candidates),
                    deadline=deadline,
                ),
            )
        )

    def confirm_artifact(self, artifact: Artifact | None) -> None:
        """Record the answer. The orchestrator releases the run; this is the
        view of it the API reads back."""
        self.artifact = artifact
        self.artifact_candidates = []
        self.stage = RunStage.PLANNING
        self.status = RunStatus.RUNNING

    def append_check(self, result: CheckResult) -> None:
        """Append one terminal result and tell every subscriber. Never updates."""
        index = len(self.checks)
        self.checks.append(result)
        self._publish(
            (StreamEvent.CHECK, CheckEvent(run_id=self.run_id, index=index, result=result))
        )

    def finish(
        self,
        report: RunReport,
        *,
        stage: RunStage = RunStage.COMPLETE,
        artifact: Artifact | None = None,
    ) -> None:
        """Record the run-level fields the individual checks cannot know, and
        close every stream.

        `stage` carries the §14.2 outcome — `complete`, `partial` or `failed`.
        `status` stays `complete` for all three: every one of them produced a
        report, and that is what `status` is about.
        """
        self.title = report.title or self.title
        self.tables_parsed = report.tables_parsed
        self.not_checked = list(report.not_checked)
        self.started_at = report.started_at or self.started_at
        self.finished_at = report.finished_at or _now()
        self.stage = stage
        self.artifact = artifact or self.artifact
        self.artifact_candidates = []
        self.status = _status_for(stage)
        self._publish(
            (StreamEvent.DONE, DoneEvent(run_id=self.run_id, run=self.envelope()))
        )
        self._close()

    # -- streaming --------------------------------------------------------

    def subscribe(self) -> tuple[asyncio.Queue[Event | None], list[Event]]:
        """A live queue plus everything that has already happened.

        Returned together and without awaiting in between, so no event can slip
        through the gap between the replay and the subscription.
        """
        replay: list[Event] = [(StreamEvent.MANIFEST, self.manifest)]
        for index, result in enumerate(self.checks):
            replay.append(
                (StreamEvent.CHECK, CheckEvent(run_id=self.run_id, index=index, result=result))
            )
        if self.stage is RunStage.AWAITING_ARTIFACT:
            # A client that connects while the run is paused has to be told, or
            # it renders a run that appears stuck.
            replay.append(
                (
                    StreamEvent.STATE,
                    StateEvent(
                        run_id=self.run_id,
                        state=self.stage,
                        artifact_candidates=list(self.artifact_candidates),
                        deadline=self.artifact_deadline,
                    ),
                )
            )
        queue: asyncio.Queue[Event | None] = asyncio.Queue()
        if self.status is RunStatus.COMPLETE:
            replay.append((StreamEvent.DONE, DoneEvent(run_id=self.run_id, run=self.envelope())))
            queue.put_nowait(None)  # already terminal: the stream ends after the replay
        else:
            self._subscribers.append(queue)
        return queue, replay

    def unsubscribe(self, queue: asyncio.Queue[Event | None]) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    def _publish(self, event: Event) -> None:
        for queue in list(self._subscribers):
            queue.put_nowait(event)

    def _close(self) -> None:
        for queue in list(self._subscribers):
            queue.put_nowait(None)
        self._subscribers.clear()


class RunStore:
    """Most-recent-first, bounded. Process-local: restarting the server loses
    history, which is acceptable until Postgres exists."""

    def __init__(self, max_runs: int = 200) -> None:
        self.max_runs = max_runs
        self._runs: "OrderedDict[str, RunRecord]" = OrderedDict()

    def create(self, arxiv_id: str, manifest_checks, version: str | None = None) -> RunRecord:
        run_id = uuid.uuid4().hex
        manifest = RunManifest(
            run_id=run_id, arxiv_id=arxiv_id, version=version, checks=list(manifest_checks)
        )
        record = RunRecord(run_id=run_id, arxiv_id=arxiv_id, manifest=manifest)
        self._runs[run_id] = record
        while len(self._runs) > self.max_runs:
            self._runs.popitem(last=False)
        return record

    def get(self, run_id: str) -> RunRecord | None:
        return self._runs.get(run_id)

    def recent(self, limit: int = 20) -> list[RunRecord]:
        return list(reversed(list(self._runs.values())))[:limit]


__all__ = ["RunRecord", "RunStore"]
