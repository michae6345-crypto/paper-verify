"""API-level envelopes around the contract.

Every payload the frontend receives is a Pydantic model, and every payload that
carries checker output carries it as the contract type from `pv.models` —
`RunReport`, `CheckResult`, `Artifact`, `NotChecked`. The models here add only
what the transport needs and the contract does not have: a run identifier, and
the run manifest.

**The manifest is why this file exists.** §10 is append-only: a check result is
never updated, only superseded, so `RunReport.checks` only ever receives terminal
results. `pending` and `running` (§5.3) are therefore not stored anywhere — they
are derived by the UI from the difference between the manifest (the checks this
run intends to execute, known before any of them runs) and the results that have
landed. There is no mutable status column, and adding one would put a second,
lying source of truth next to the append-only log.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Union

from pydantic import BaseModel, Field

from ..models import CheckResult, RunReport, Verdict


class RunStatus(str, Enum):
    """Run-level lifecycle. Derived, never stored on a check.

    `complete` means the run finished, whatever the verdicts were. A run does not
    fail: a paper we could not check is a report saying so.
    """

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"


class CheckDescriptor(BaseModel):
    """One entry in the manifest: a check this run intends to execute.

    Matches a `CheckResult` by `checker`. `display_name` and `description` are
    the same strings the result will carry, so a pending row and a completed row
    read identically apart from the verdict.
    """

    checker: str
    checker_version: str
    display_name: str = ""
    description: str = ""


class RunManifest(BaseModel):
    run_id: str
    arxiv_id: str
    version: str | None = None
    # In execution order. Render the whole list; mark each off as its result lands.
    checks: list[CheckDescriptor] = Field(default_factory=list)


class Run(BaseModel):
    """A run and everything known about it right now."""

    run_id: str
    arxiv_id: str
    status: RunStatus
    manifest: RunManifest
    # The contract type, unchanged. `report.checks` holds only terminal results.
    report: RunReport


class RunSummary(BaseModel):
    """One row of §5.1's recently checked papers."""

    run_id: str
    arxiv_id: str
    title: str = ""
    status: RunStatus
    started_at: datetime | None = None
    finished_at: datetime | None = None
    tables_parsed: int = 0
    # The verdict strip — §5.5's visual fingerprint, in check order.
    verdicts: list[Verdict] = Field(default_factory=list)
    findings: int = 0
    not_checked: int = 0


class RunList(BaseModel):
    runs: list[RunSummary] = Field(default_factory=list)


class CreateRunRequest(BaseModel):
    """`arxiv_id` accepts a bare id (`1706.03762`), a versioned id (`1706.03762v5`),
    or a full arXiv URL. It is normalised server-side."""

    arxiv_id: str


# --------------------------------------------------------------------------
# SSE event payloads. Named so the generated TypeScript can discriminate on the
# event name and parse the data with the matching contract model.
# --------------------------------------------------------------------------


class StreamEvent(str, Enum):
    MANIFEST = "manifest"
    CHECK = "check"
    DONE = "done"


class CheckEvent(BaseModel):
    """`event: check`. One per completed check, in manifest order."""

    run_id: str
    # Position in `manifest.checks`, so a client that reconnects can order events
    # without depending on arrival time.
    index: int
    result: CheckResult


class DoneEvent(BaseModel):
    """`event: done`. Terminal. Carries the complete report, including the
    run-level `not_checked` list, which no individual check can produce."""

    run_id: str
    run: Run


StreamPayload = Union[RunManifest, CheckEvent, DoneEvent]
"""What `data:` holds on the stream, by event name:
`manifest` -> RunManifest, `check` -> CheckEvent, `done` -> DoneEvent."""


__all__ = [
    "CheckDescriptor",
    "CheckEvent",
    "CreateRunRequest",
    "DoneEvent",
    "Run",
    "RunList",
    "RunManifest",
    "RunStatus",
    "RunSummary",
    "StreamEvent",
    "StreamPayload",
]
