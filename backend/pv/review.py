"""The review gate (§14.8). What must be read by a human before it is public.

    Any finding with `verdict == diverges` and `severity == high` is held out of a
    public permalink until a person releases it.

That is the whole rule. Everything below is the consequence of taking it
seriously.

**Why this exists.** A `diverges` finding at high severity is the strongest thing
this system says about a named researcher: their paper's own numbers do not agree.
Six false positives have already been caught here before shipping, every one of
them the same shape — a lossy reading that produced a confident accusation
(CLAUDE.md). The seventh will not be caught in review of the code, because by
definition we did not think of it. The gate is what stands between the seventh and
a public URL.

`docs/DEPLOY.md` flags public-by-default permalinks as an unresolved decision.
This resolves it: the permalink is redacted by default and released by a person.
At current scale that is one person reading a short list, which is a poor argument
for building it and an excellent argument for building it now — retrofitting a
review gate after something has been published is impossible.

**Redaction never leaves a lie behind.** Removing a finding from a report that
still says `diverges` would be exactly the recurring defect: a narrowing step that
discards the evidence and keeps the accusation. So when every finding a check
produced is held, the check is removed from the public report entirely and counted
in `held`, and the public surface says plainly that some findings are held for
review. It never reports a check as `matches` that did not, and it never shows a
verdict whose evidence it is withholding.

**Suppression is a fixture.** Suppressing a false positive writes a negative
fixture under `fixtures/suppressions/`, so the mistake becomes a permanent
regression test rather than a decision someone remembers. A suppression with no
fixture behind it is just a deletion, and this codebase has already demonstrated
that the same class of defect recurs.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from .models import CheckResult, Finding, RunReport, Severity, Verdict

# Where suppressions land. Sibling of fixtures/reports/, which holds what the
# system *does* say; this holds what it must never say again.
SUPPRESSIONS_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "suppressions"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ReviewState(str, Enum):
    """Where one gated finding stands.

    `held` is the default and is not stored — a finding nobody has looked at is
    held, and that has to be true of a finding whose review row was lost, not just
    of one whose row says so. Absence means held. There is no configuration under
    which an unreviewed high-severity divergence becomes public.
    """

    HELD = "held"
    RELEASED = "released"
    SUPPRESSED = "suppressed"


class SuppressionReason(str, Enum):
    """Why a finding must not be published. Required — a suppression with no
    reason is an untraceable deletion.

    These are not `ReasonCode`s and must not be confused with them. A `ReasonCode`
    says why a check could not reach a verdict about a paper. These say why a
    verdict we did reach was wrong about a paper, and each one names a specific
    failure this codebase has actually produced (CLAUDE.md).
    """

    # The number we read is not the number on the page — `86.7/85.9` read as one
    # value, a `\includegraphics` width read as data.
    VALUE_MISREAD = "value_misread"
    # The value is right and the comparison set is wrong — compared across a whole
    # column instead of within its rule-delimited block.
    COMPARISON_SET_WRONG = "comparison_set_wrong"
    # Higher-is-better assumed where lower is better, or the reverse.
    METRIC_DIRECTION_WRONG = "metric_direction_wrong"
    # The finding is attached to the wrong claim, table, or reference — a citation
    # matched by title containment onto a different paper.
    CLAIM_MISATTRIBUTED = "claim_misattributed"
    # Both numbers are read correctly and the gap is inside what the reported
    # precision implies. The policy is too tight, not the paper wrong.
    TOLERANCE_TOO_TIGHT = "tolerance_too_tight"
    # Everything was read correctly and the paper is consistent under a reading we
    # did not model — a header we took for an average that was a grouping.
    NOT_A_DISCREPANCY = "not_a_discrepancy"


# Shown to a reviewer next to each option. Sentence case, active voice, and about
# what we got wrong rather than about what the author did.
SUPPRESSION_LABEL: dict[SuppressionReason, str] = {
    SuppressionReason.VALUE_MISREAD: "We read the value wrong",
    SuppressionReason.COMPARISON_SET_WRONG: "We compared against the wrong set of values",
    SuppressionReason.METRIC_DIRECTION_WRONG: "We had the metric direction backwards",
    SuppressionReason.CLAIM_MISATTRIBUTED: "We pointed at the wrong claim",
    SuppressionReason.TOLERANCE_TOO_TIGHT: "The difference is within the precision reported",
    SuppressionReason.NOT_A_DISCREPANCY: "The paper is consistent under a reading we did not model",
}


def is_gated(check: CheckResult, finding: Finding) -> bool:
    """§14.8's rule, in one place so nothing can implement half of it."""
    return check.verdict is Verdict.DIVERGES and finding.severity is Severity.HIGH


@dataclass
class ReviewEntry:
    """One decision, and enough context to make it without opening the report."""

    run_id: str
    arxiv_id: str
    fingerprint: str
    checker: str
    checker_version: str
    policy_version: str
    siglum: str
    locator: str
    claimed: str | None
    computed: str | None
    delta: str | None
    verbatim: str
    explanation: str
    state: ReviewState = ReviewState.HELD
    reason: SuppressionReason | None = None
    note: str = ""
    decided_at: datetime | None = None
    decided_by: str = ""


def _entry(run_id: str, arxiv_id: str, check: CheckResult, finding: Finding, fp: str) -> ReviewEntry:
    return ReviewEntry(
        run_id=run_id,
        arxiv_id=arxiv_id,
        fingerprint=fp,
        checker=check.checker,
        checker_version=check.checker_version,
        policy_version=check.policy_version,
        siglum=finding.siglum,
        locator=finding.anchor.human_locator or finding.anchor.dom_id,
        claimed=finding.claimed,
        computed=finding.computed,
        delta=finding.delta,
        verbatim=finding.verbatim,
        explanation=finding.explanation,
    )


class ReleaseRequiresReview(RuntimeError):
    """Release or suppress arrived for a finding the gate does not hold."""


@dataclass
class ReviewQueue:
    """Decisions, keyed by (run, fingerprint). Process-local, like every other
    store here until Postgres exists.

    Only decisions are stored. The queue itself — what is waiting — is derived
    from the report every time it is asked for, so a finding cannot be held in a
    list that has fallen out of step with what the run actually produced.
    """

    suppressions_dir: Path = SUPPRESSIONS_DIR
    _decisions: dict[tuple[str, str], ReviewEntry] = field(default_factory=dict)

    # -- reads ------------------------------------------------------------

    def state_of(self, run_id: str, fingerprint: str) -> ReviewState:
        entry = self._decisions.get((run_id, fingerprint))
        return entry.state if entry is not None else ReviewState.HELD

    def is_public(self, run_id: str, fingerprint: str) -> bool:
        return self.state_of(run_id, fingerprint) is ReviewState.RELEASED

    def pending(self, run_id: str, report: RunReport) -> list[ReviewEntry]:
        """Everything in this run the gate holds, decided or not, in report order.

        A released finding stays in the list with `state: released`. The queue is
        the record of what was reviewed, not only of what is outstanding — a list
        that empties as decisions are made loses the ability to answer "who
        released this, and when".
        """
        from .amendments.identity import finding_fingerprint

        out: list[ReviewEntry] = []
        for check in report.checks:
            for finding in check.findings:
                if not is_gated(check, finding):
                    continue
                fp = finding_fingerprint(check, finding)
                decided = self._decisions.get((run_id, fp))
                out.append(decided or _entry(run_id, report.arxiv_id, check, finding, fp))
        return out

    def held_count(self, run_id: str, report: RunReport) -> int:
        return sum(1 for e in self.pending(run_id, report) if e.state is not ReviewState.RELEASED)

    # -- writes -----------------------------------------------------------

    def _locate(self, run_id: str, report: RunReport, fingerprint: str) -> ReviewEntry:
        for entry in self.pending(run_id, report):
            if entry.fingerprint == fingerprint:
                return entry
        raise ReleaseRequiresReview(
            f"No finding held for review in run {run_id} carries that fingerprint."
        )

    def release(
        self, run_id: str, report: RunReport, fingerprint: str, *, by: str = "", note: str = ""
    ) -> ReviewEntry:
        """A person has read this and it may be published."""
        entry = self._locate(run_id, report, fingerprint)
        entry.state = ReviewState.RELEASED
        entry.reason = None
        entry.note = note
        entry.decided_at = _now()
        entry.decided_by = by
        self._decisions[(run_id, fingerprint)] = entry
        return entry

    def suppress(
        self,
        run_id: str,
        report: RunReport,
        fingerprint: str,
        *,
        reason: SuppressionReason,
        note: str = "",
        by: str = "",
        write_fixture: bool = True,
    ) -> ReviewEntry:
        """This finding is wrong. Never publish it, and never produce it again.

        The second half of that sentence is what `write_fixture` is for. A
        suppression that only hides a finding fixes one URL; a suppression that
        writes a negative fixture fixes the class of defect, because the fixture
        is a test that fails the day the same reading comes back.
        """
        entry = self._locate(run_id, report, fingerprint)
        entry.state = ReviewState.SUPPRESSED
        entry.reason = reason
        entry.note = note
        entry.decided_at = _now()
        entry.decided_by = by
        self._decisions[(run_id, fingerprint)] = entry
        if write_fixture:
            write_negative_fixture(entry, directory=self.suppressions_dir)
        return entry


# --------------------------------------------------------------------------
# Redaction
# --------------------------------------------------------------------------


def redact(report: RunReport, queue: ReviewQueue, run_id: str) -> tuple[RunReport, int]:
    """The public view of a report, and how many findings it is withholding.

    Returns a copy. The stored report is never modified: it is the record of what
    the run found, and the gate governs publication, not the record.

    A check whose findings are *all* held loses the whole `CheckResult`, verdict
    included. Keeping the row and dropping its evidence would publish "this
    paper's numbers diverge" with nothing behind it — a confident accusation
    standing on data we deliberately withheld, which is the recurring defect in
    this codebase wearing a different hat. A check with some findings held keeps
    the rest: the verdict is still supported by what remains on the page.
    """
    from .amendments.identity import finding_fingerprint

    public = report.model_copy(deep=True)
    kept: list[CheckResult] = []
    held = 0

    for check in public.checks:
        gated = [f for f in check.findings if is_gated(check, f)]
        if not gated:
            kept.append(check)
            continue
        visible = []
        for finding in check.findings:
            if not is_gated(check, finding):
                visible.append(finding)
                continue
            if queue.is_public(run_id, finding_fingerprint(check, finding)):
                visible.append(finding)
            else:
                held += 1
        if not visible:
            continue  # the whole check goes; its verdict has no evidence left
        check.findings = visible
        kept.append(check)

    public.checks = kept
    return public, held


# §7: sentence case, active voice, and no suggestion that anything went wrong.
# A held finding is one a person has not read yet, which is a normal state of a
# fresh run and must not read as an error or as a hint of something scandalous.
HELD_NOTICE = (
    "Some findings in this report are being read by a person before they are "
    "shown here."
)


def held_notice(held: int) -> str:
    """The one line a public report shows when it is withholding something."""
    if held <= 0:
        return ""
    if held == 1:
        return "One finding in this report is being read by a person before it is shown here."
    return HELD_NOTICE


# --------------------------------------------------------------------------
# Negative fixtures
# --------------------------------------------------------------------------

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def fixture_name(entry: ReviewEntry) -> str:
    """`<arxiv_id>-<checker>-<first 12 of the fingerprint>.json`.

    The fingerprint is truncated for a readable filename and carried in full
    inside the file, which is what anything actually matches on.
    """
    stem = _SAFE.sub("-", f"{entry.arxiv_id or 'unknown'}-{entry.checker}")
    return f"{stem}-{entry.fingerprint[:12]}.json"


def write_negative_fixture(entry: ReviewEntry, directory: Path = SUPPRESSIONS_DIR) -> Path:
    """Write one suppression to disk as a regression test.

    The file records the judgement in enough detail to be re-derived: the checker
    and the version and policy it ran under, the anchor, both numbers, and the
    fingerprint. `tests/test_review.py` reads every file here and asserts the
    fingerprint is not produced again by the checker at the version recorded.

    Deliberately not the whole `Finding`: `explanation` is our prose about a
    finding we have just agreed was wrong, and a fixture is not the place to keep
    a sentence we do not stand behind. What must not recur is the comparison, and
    that is what is stored.
    """
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / fixture_name(entry)
    payload = {
        "arxiv_id": entry.arxiv_id,
        "finding_fingerprint": entry.fingerprint,
        "checker": entry.checker,
        "checker_version": entry.checker_version,
        "policy_version": entry.policy_version,
        "locator": entry.locator,
        "claimed": entry.claimed,
        "computed": entry.computed,
        "reason": entry.reason.value if entry.reason else None,
        "reason_label": SUPPRESSION_LABEL[entry.reason] if entry.reason else "",
        "note": entry.note,
        "suppressed_at": (entry.decided_at or _now()).isoformat(),
        "suppressed_by": entry.decided_by,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def read_negative_fixtures(directory: Path = SUPPRESSIONS_DIR) -> list[dict]:
    """Every committed suppression. An empty list is the expected state of a
    system that has not yet been wrong in public."""
    if not directory.is_dir():
        return []
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(directory.glob("*.json"))
    ]


__all__ = [
    "HELD_NOTICE",
    "ReleaseRequiresReview",
    "ReviewEntry",
    "ReviewQueue",
    "ReviewState",
    "SUPPRESSION_LABEL",
    "SUPPRESSIONS_DIR",
    "SuppressionReason",
    "fixture_name",
    "held_notice",
    "is_gated",
    "read_negative_fixtures",
    "redact",
    "write_negative_fixture",
]
