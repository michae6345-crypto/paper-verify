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

from ..models import Amendment, Artifact, CheckResult, RunReport, Severity, Verdict
from ..orchestrator import RunStage
from ..review import AmendmentDeclineReason, ReviewKind, ReviewState, SuppressionReason


class RunStatus(str, Enum):
    """Run-level lifecycle, coarse. Derived, never stored on a check.

    `complete` means the run finished, whatever the verdicts were. A run does not
    fail: a paper we could not check is a report saying so.

    The fine-grained §14.2 state is `Run.state` (`RunStage`). This stays because
    it is what the run list and the verdict strip need — three values, and the
    difference between "waiting" and "working" is not one of them.
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
    # The §14.2 state. `awaiting_artifact` is the one a client must react to: the
    # run is paused on the §5.2 confirmation screen and will proceed without code
    # when its window closes.
    state: RunStage = RunStage.QUEUED
    manifest: RunManifest
    # The contract type, unchanged. `report.checks` holds only terminal results.
    report: RunReport
    # §5.2 candidates, best first, populated only while `state` is
    # `awaiting_artifact`. Empty is a legitimate answer.
    artifact_candidates: list[Artifact] = Field(default_factory=list)
    # The confirmed repository, or null for "continue without code" — which §5.2
    # calls a normal path, not a failure.
    artifact: Artifact | None = None


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
    # Pause in `awaiting_artifact` for the §5.2 confirmation screen when the paper
    # links a repository. Off by default: a client that will not answer must not
    # be able to leave a run waiting, and the ten-minute ceiling means even one
    # that asked and walked away gets a report.
    confirm_repository: bool = False


class ConfirmArtifactRequest(BaseModel):
    """The §5.2 answer. `artifact: null` is "continue without code" — a normal
    choice that releases the run exactly as a repository does."""

    artifact: Artifact | None = None


# --------------------------------------------------------------------------
# SSE event payloads. Named so the generated TypeScript can discriminate on the
# event name and parse the data with the matching contract model.
# --------------------------------------------------------------------------


class StreamEvent(str, Enum):
    MANIFEST = "manifest"
    CHECK = "check"
    # Emitted only when a run enters `awaiting_artifact`. Every other transition
    # is already visible in the events around it, and a client that does not use
    # the §5.2 flow never sees this one.
    STATE = "state"
    DONE = "done"


class StateEvent(BaseModel):
    """`event: state`. The run is paused for a decision it cannot make itself."""

    run_id: str
    state: RunStage
    artifact_candidates: list[Artifact] = Field(default_factory=list)
    # When the run will proceed without code if nobody answers (§14.2).
    deadline: datetime | None = None


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


# --------------------------------------------------------------------------
# Amendments (brief Part 2, item 1)
#
# `Amendment` itself is the contract type and travels unchanged. What is added
# here is only what the transport needs: the fingerprint in the path, and the
# fresh `CheckResult` a recheck produced — which is not stored on the run, because
# a recheck is a second look and not a second verdict.
# --------------------------------------------------------------------------


class CreateAmendmentRequest(BaseModel):
    """An author's contest of one finding.

    `finding_fingerprint` identifies the judgement, not the row: it is a §14.5
    fingerprint over the finding's content, the checker, the checker version and
    the policy version. Improve the checker and the fingerprint changes, so this
    objection correctly stops applying to a judgement it was never made about.
    `pv.amendments.identity.finding_fingerprint` derives it from the report, so a
    client computes the same value from the same bytes without either side
    storing it.
    """

    finding_fingerprint: str
    # The author's own words. Shown verbatim next to the finding, never
    # paraphrased and never summarised — it is the half of the record that is not
    # ours.
    author_statement: str
    # There is deliberately **no name field here.** A client-supplied name is not
    # an identity; printing one beside a statement on a named researcher's page
    # would attribute words to someone who may never have written them. Identity
    # is derived from the request by `pv.amendments.submitter`, which today
    # returns "not identified" for everyone. Adding an auth layer changes that
    # function and this request shape not at all.
    # What the author says the value should be. A string, matching
    # `Finding.claimed`, because the paper's own formatting is part of the claim.
    corrected_value: str | None = None


class FindingIndex(BaseModel):
    """Every finding in a report, keyed so a rendered row can find its identity.

    A `RunReport` carries no per-finding fingerprint — `Finding` has no such field
    on the contract, and it is derived rather than stored (see
    `pv.amendments.identity`). The frontend needs it anyway, to say *which*
    judgement a Contest affordance is contesting.

    Deriving it a second time in TypeScript is the option not taken. This
    codebase already has two modules implementing the same four LaTeX primitives
    in two different ways because nothing imports both (CLAUDE.md); a second
    implementation of a hash that decides which objection attaches to which
    accusation would be that mistake in the one place it must not be made. There
    is one implementation, in Python, and this endpoint serves its output.

    `by_row` is keyed `"<anchor.dom_id>:<checker>"`, which is the identity the
    ledger already builds each row on. A key that two findings would share is
    **omitted** rather than resolved to either of them: an ambiguous key would let
    a Contest button attach an author's statement to the wrong finding, and there
    is no reading of that which is acceptable. Such findings are still in
    `fingerprints`, addressable by whoever can disambiguate them.
    """

    run_id: str
    # Fingerprint -> the row key it belongs to, in report order.
    fingerprints: list[str] = Field(default_factory=list)
    by_row: dict[str, str] = Field(default_factory=dict)


class AmendmentList(BaseModel):
    """The amendment history for a report, oldest first.

    Every row, not the latest per finding: a reader has to be able to see the
    objection, the recheck and the outcome as a sequence. `current` is the
    superseding view — the standing amendment per fingerprint — which is what a
    Discrepancy row consults to know it has been contested.
    """

    run_id: str
    amendments: list[Amendment] = Field(default_factory=list)
    current: dict[str, Amendment] = Field(default_factory=dict)


class RecheckResponse(BaseModel):
    """What a second look produced.

    `executed` is false on a §14.5 cache hit: the checker has not changed since
    the run, so the stored verdict *is* the answer and nothing was executed.
    Saying we re-ran it would be a claim about work we did not do.

    `result` is returned, never stored. The run is the record of what we found
    when we looked; a recheck is a separate event and the two must stay legible
    as separate events.
    """

    run_id: str
    amendment: Amendment
    executed: bool
    # True when the contested comparison is still reported. Null when we could not
    # establish it — never defaulted to false, because a false all-clear sent to
    # an author is the worst outcome this flow has.
    still_found: bool | None = None
    result: CheckResult | None = None
    # One sentence, safe to show an author verbatim.
    note: str = ""


# --------------------------------------------------------------------------
# Review gate (§14.8)
# --------------------------------------------------------------------------


class ReviewItem(BaseModel):
    """One thing the gate holds, with enough context to decide without opening
    the report.

    `kind` says which of the two it is, and they are not symmetrical. A held
    `finding` is a claim we would make about a named researcher. A held
    `amendment` is a statement someone else has made about us on that
    researcher's page — and holding it withholds the statement only. The finding
    it contests is untouched, because with no auth layer a contest that could
    suppress a finding would let anyone bury a true one.
    """

    fingerprint: str
    kind: ReviewKind = ReviewKind.FINDING
    state: ReviewState
    checker: str = ""
    checker_version: str = ""
    policy_version: str = ""
    severity: Severity = Severity.HIGH
    siglum: str = ""
    locator: str = ""
    claimed: str | None = None
    computed: str | None = None
    delta: str | None = None
    verbatim: str = ""
    explanation: str = ""
    # Amendment items only.
    statement: str = ""
    # What we can say about who sent it — never a name a client supplied. Today
    # this reads "Sender not identified" for every amendment.
    submitter: str = ""
    # The finding fingerprint this statement contests.
    contests: str = ""
    reason: SuppressionReason | AmendmentDeclineReason | None = None
    note: str = ""
    decided_at: datetime | None = None
    decided_by: str = ""


class ReviewQueueResponse(BaseModel):
    run_id: str
    arxiv_id: str
    # Findings first, then amendments — the order a reviewer needs them in, since
    # an amendment cannot be judged without the finding it answers. Released items
    # stay in the list: this is the record of what was reviewed, not only of what
    # is outstanding.
    items: list[ReviewItem] = Field(default_factory=list)
    held: int = 0
    held_findings: int = 0
    held_amendments: int = 0


class DeclineAmendmentRequest(BaseModel):
    """Why a statement is not published on the paper's page.

    A separate vocabulary from `SuppressRequest`. Suppressing says we read a paper
    wrong; declining says nothing about the paper at all, and the two must not
    share an enum that would let one be read as the other. Declining writes no
    negative fixture and deletes nothing — the statement stays in the append-only
    log.
    """

    reason: AmendmentDeclineReason
    note: str = ""
    decided_by: str = ""


class SuppressRequest(BaseModel):
    """Why this finding must not be published. The reason is required — a
    suppression with no reason is an untraceable deletion, and every suppression
    is written into `fixtures/` as a negative fixture keyed on it."""

    reason: SuppressionReason
    note: str = ""
    decided_by: str = ""


class ReleaseRequest(BaseModel):
    note: str = ""
    decided_by: str = ""


class PublicReport(BaseModel):
    """A report as a permalink shows it (§14.8).

    High-severity divergences are withheld until a person has read them, and a
    check whose findings are all withheld is removed entirely rather than left
    asserting a verdict whose evidence is not on the page.

    `notice` is the one line the page shows when something is being withheld.
    Empty when nothing is — the common case, and a page that always carried the
    sentence would make every clean report look qualified.
    """

    run_id: str
    report: RunReport
    # Counted separately because they mean opposite things to a reader: a
    # withheld finding is something we might yet say about this paper, a withheld
    # statement is something someone else has said about us.
    held_findings: int = 0
    held_amendments: int = 0
    # `held_findings + held_amendments`, for a caller that only needs to know
    # whether anything is being withheld.
    held: int = 0
    notice: str = ""


StreamPayload = Union[RunManifest, CheckEvent, StateEvent, DoneEvent]
"""What `data:` holds on the stream, by event name:
`manifest` -> RunManifest, `check` -> CheckEvent, `state` -> StateEvent,
`done` -> DoneEvent."""


__all__ = [
    "AmendmentList",
    "CheckDescriptor",
    "CheckEvent",
    "ConfirmArtifactRequest",
    "CreateAmendmentRequest",
    "CreateRunRequest",
    "DeclineAmendmentRequest",
    "DoneEvent",
    "FindingIndex",
    "PublicReport",
    "RecheckResponse",
    "ReleaseRequest",
    "ReviewItem",
    "ReviewQueueResponse",
    "SuppressRequest",
    "RunStage",
    "StateEvent",
    "Run",
    "RunList",
    "RunManifest",
    "RunStatus",
    "RunSummary",
    "StreamEvent",
    "StreamPayload",
]
