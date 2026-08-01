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

## The queue has two sources, and they are not symmetrical

§14.8 names one: a finding *we* assert about a named researcher. There is a
second, which the architecture does not name because the amendment flow did not
exist when it was written: a statement *someone else* asserts about us, on a page
carrying a named researcher's name. There is no auth layer
(`pv.amendments.submitter`), so anyone can send one. Both must be read by a
person before they are public, and both land here.

What they must **not** share is the effect of being held:

    A held finding is withheld.
    A held amendment is withheld — and the finding it contests stays exactly
    where it was.

The asymmetry is the whole point. If contesting a finding suppressed it, then
anyone who could reach the endpoint could erase any finding from any public
report by objecting to it, and the flow built to protect authors from a false
accusation would become the mechanism for burying a true one. So an amendment
never changes what a report says. It is a signal for a person to look at, and
until a person has looked, the permalink shows what the run found and nothing
else.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from .models import Amendment, CheckResult, Finding, RunReport, Severity, Verdict

# Where suppressions land. Sibling of fixtures/reports/, which holds what the
# system *does* say; this holds what it must never say again.
SUPPRESSIONS_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "suppressions"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ReviewKind(str, Enum):
    """What sort of thing is waiting, because the two are not interchangeable.

    `finding`   something we assert about a named researcher. Held means the
                claim is withheld from the permalink.
    `amendment` something an unidentified sender asserts about us, on a page
                carrying that researcher's name. Held means the *statement* is
                withheld; the finding it contests is untouched.

    Keeping these distinct in one enum rather than in two queues is deliberate:
    one reviewer, one list, one place where "what is waiting" is answered. A
    second queue is a second thing to forget to read.
    """

    FINDING = "finding"
    AMENDMENT = "amendment"


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


class AmendmentDeclineReason(str, Enum):
    """Why a statement is not published. Required, for the same reason a
    suppression's is: an unexplained decision not to publish someone's words is
    exactly the thing this flow exists to make impossible.

    A separate vocabulary from `SuppressionReason` on purpose. Those say we read a
    paper wrong. These say nothing about the paper at all — declining to publish a
    statement is never a finding that the statement is untrue, and the enum must
    not let anyone imply that it is. `AUTHORSHIP_UNVERIFIED` is expected to be the
    common one until there is an auth layer.
    """

    # We cannot establish that this came from an author of the paper. The default
    # outcome today, and not a judgement about the sender or the statement.
    AUTHORSHIP_UNVERIFIED = "authorship_unverified"
    # The statement does not address the comparison the finding makes.
    NOT_ABOUT_THE_FINDING = "not_about_the_finding"
    # The sender asked us to withdraw it.
    WITHDRAWN_BY_SENDER = "withdrawn_by_sender"
    # Content we will not host on a page carrying someone's name.
    NOT_PUBLISHABLE = "not_publishable"


DECLINE_LABEL: dict[AmendmentDeclineReason, str] = {
    AmendmentDeclineReason.AUTHORSHIP_UNVERIFIED: (
        "We could not confirm this came from an author of the paper"
    ),
    AmendmentDeclineReason.NOT_ABOUT_THE_FINDING: (
        "The statement does not address this comparison"
    ),
    AmendmentDeclineReason.WITHDRAWN_BY_SENDER: "The sender withdrew it",
    AmendmentDeclineReason.NOT_PUBLISHABLE: "We will not publish this on the paper's page",
}


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
    kind: ReviewKind = ReviewKind.FINDING
    checker: str = ""
    checker_version: str = ""
    policy_version: str = ""
    siglum: str = ""
    locator: str = ""
    claimed: str | None = None
    computed: str | None = None
    delta: str | None = None
    verbatim: str = ""
    explanation: str = ""
    # Amendment entries only: the statement, and what we can say about who sent
    # it. `submitter` is a label from `pv.amendments.submitter`, never a name a
    # client supplied — printing a self-declared name beside a statement on a
    # named researcher's page is the failure this whole seam exists to prevent.
    statement: str = ""
    submitter: str = ""
    # The judgement this statement contests. Lets a reviewer see both halves.
    contests: str = ""
    state: ReviewState = ReviewState.HELD
    reason: SuppressionReason | AmendmentDeclineReason | None = None
    note: str = ""
    decided_at: datetime | None = None
    decided_by: str = ""


def _entry(run_id: str, arxiv_id: str, check: CheckResult, finding: Finding, fp: str) -> ReviewEntry:
    return ReviewEntry(
        run_id=run_id,
        arxiv_id=arxiv_id,
        fingerprint=fp,
        kind=ReviewKind.FINDING,
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


def _amendment_entry(
    run_id: str, arxiv_id: str, amendment: Amendment, fp: str, submitter: str
) -> ReviewEntry:
    return ReviewEntry(
        run_id=run_id,
        arxiv_id=arxiv_id,
        fingerprint=fp,
        kind=ReviewKind.AMENDMENT,
        locator=amendment.claim_id,
        statement=amendment.author_statement,
        claimed=amendment.corrected_value,
        submitter=submitter,
        contests=amendment.finding_fingerprint,
        # Our own sentence about a recheck, if there was one — kept in the field
        # that already means "the system's sentence", and visibly apart from
        # `statement`, which is theirs. `note` is the reviewer's and stays free.
        explanation=amendment.resolution_note,
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
    # Keyed by (run, kind, fingerprint). The kind is in the key because a finding
    # and the amendment contesting it are two separate decisions, and releasing
    # one must never release the other.
    _decisions: dict[tuple[str, ReviewKind, str], ReviewEntry] = field(default_factory=dict)

    # -- reads ------------------------------------------------------------

    def state_of(
        self, run_id: str, fingerprint: str, kind: ReviewKind = ReviewKind.FINDING
    ) -> ReviewState:
        entry = self._decisions.get((run_id, kind, fingerprint))
        return entry.state if entry is not None else ReviewState.HELD

    def is_public(
        self, run_id: str, fingerprint: str, kind: ReviewKind = ReviewKind.FINDING
    ) -> bool:
        return self.state_of(run_id, fingerprint, kind) is ReviewState.RELEASED

    def pending(self, run_id: str, report: RunReport) -> list[ReviewEntry]:
        """Everything in this run the gate holds, decided or not, in report order.

        Findings first, then amendments — the order a reviewer needs them in, since
        an amendment cannot be judged without the finding it answers.

        A released item stays in the list with `state: released`. The queue is the
        record of what was reviewed, not only of what is outstanding — a list that
        empties as decisions are made loses the ability to answer "who released
        this, and when".
        """
        from .amendments.identity import amendment_fingerprint, finding_fingerprint
        from .amendments.submitter import UNKNOWN

        out: list[ReviewEntry] = []
        for check in report.checks:
            for finding in check.findings:
                if not is_gated(check, finding):
                    continue
                fp = finding_fingerprint(check, finding)
                decided = self._decisions.get((run_id, ReviewKind.FINDING, fp))
                out.append(decided or _entry(run_id, report.arxiv_id, check, finding, fp))

        # Every amendment, not only the standing one per finding. Each row carries
        # text nobody has read — a superseding row from a recheck adds our sentence
        # to theirs — so each is its own decision.
        for amendment in report.amendments or []:
            fp = amendment_fingerprint(amendment)
            decided = self._decisions.get((run_id, ReviewKind.AMENDMENT, fp))
            out.append(
                decided
                or _amendment_entry(
                    run_id, report.arxiv_id, amendment, fp, UNKNOWN.label
                )
            )
        return out

    def held_count(self, run_id: str, report: RunReport) -> int:
        return sum(1 for e in self.pending(run_id, report) if e.state is not ReviewState.RELEASED)

    # -- writes -----------------------------------------------------------

    def _locate(
        self,
        run_id: str,
        report: RunReport,
        fingerprint: str,
        kind: ReviewKind = ReviewKind.FINDING,
    ) -> ReviewEntry:
        for entry in self.pending(run_id, report):
            if entry.fingerprint == fingerprint and entry.kind is kind:
                return entry
        raise ReleaseRequiresReview(
            f"Nothing held for review in run {run_id} carries that fingerprint."
        )

    def release(
        self,
        run_id: str,
        report: RunReport,
        fingerprint: str,
        *,
        kind: ReviewKind = ReviewKind.FINDING,
        by: str = "",
        note: str = "",
    ) -> ReviewEntry:
        """A person has read this and it may be published."""
        entry = self._locate(run_id, report, fingerprint, kind)
        entry.state = ReviewState.RELEASED
        entry.reason = None
        entry.note = note
        entry.decided_at = _now()
        entry.decided_by = by
        self._decisions[(run_id, kind, fingerprint)] = entry
        return entry

    def decline(
        self,
        run_id: str,
        report: RunReport,
        fingerprint: str,
        *,
        reason: AmendmentDeclineReason,
        note: str = "",
        by: str = "",
    ) -> ReviewEntry:
        """This statement is not published on the paper's page.

        Not the same act as suppressing a finding, and deliberately not the same
        method. Declining writes **no negative fixture**: a fixture records a
        judgement *we* made and withdrew, and is a regression test against our own
        checker. A statement we did not publish says nothing about a checker and
        must not be filed as though it were a defect we fixed.

        It deletes nothing either. The amendment stays in the append-only log and
        remains readable at `GET /runs/{id}/amendments`; what changes is that the
        permalink does not carry it.
        """
        entry = self._locate(run_id, report, fingerprint, ReviewKind.AMENDMENT)
        entry.state = ReviewState.SUPPRESSED
        entry.reason = reason
        entry.note = note
        entry.decided_at = _now()
        entry.decided_by = by
        self._decisions[(run_id, ReviewKind.AMENDMENT, fingerprint)] = entry
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
        entry = self._locate(run_id, report, fingerprint, ReviewKind.FINDING)
        entry.state = ReviewState.SUPPRESSED
        entry.reason = reason
        entry.note = note
        entry.decided_at = _now()
        entry.decided_by = by
        self._decisions[(run_id, ReviewKind.FINDING, fingerprint)] = entry
        if write_fixture:
            write_negative_fixture(entry, directory=self.suppressions_dir)
        return entry


# --------------------------------------------------------------------------
# Redaction
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Withheld:
    """What a public report is not showing, counted by kind.

    Two numbers rather than one because they mean opposite things to a reader:
    a withheld finding is something we might yet say about this paper, and a
    withheld statement is something someone else has said about us.
    """

    findings: int = 0
    amendments: int = 0

    @property
    def total(self) -> int:
        return self.findings + self.amendments

    def __bool__(self) -> bool:
        return self.total > 0


def redact(report: RunReport, queue: ReviewQueue, run_id: str) -> tuple[RunReport, Withheld]:
    """The public view of a report, and what it is withholding.

    Returns a copy. The stored report is never modified: it is the record of what
    the run found, and the gate governs publication, not the record.

    **Findings.** A check whose findings are *all* held loses the whole
    `CheckResult`, verdict included. Keeping the row and dropping its evidence
    would publish "this paper's numbers diverge" with nothing behind it — a
    confident accusation standing on data we deliberately withheld, which is the
    recurring defect in this codebase wearing a different hat. A check with some
    findings held keeps the rest: the verdict is still supported by what remains.

    **Amendments.** Withheld until read, and — this is the part that matters —
    withholding one changes nothing else. The findings above are computed without
    reference to whether anything contests them. There is no auth layer
    (`pv.amendments.submitter`), so if a contest could suppress a finding, anyone
    who could reach the endpoint could erase any finding from any public report by
    objecting to it. The flow built to protect authors from a false accusation
    would become the mechanism for burying a true one.
    """
    from .amendments.identity import amendment_fingerprint, finding_fingerprint

    public = report.model_copy(deep=True)
    kept: list[CheckResult] = []
    held_findings = 0

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
                held_findings += 1
        if not visible:
            continue  # the whole check goes; its verdict has no evidence left
        check.findings = visible
        kept.append(check)

    public.checks = kept

    published: list[Amendment] = []
    held_amendments = 0
    for amendment in public.amendments or []:
        if queue.is_public(run_id, amendment_fingerprint(amendment), ReviewKind.AMENDMENT):
            published.append(amendment)
        else:
            held_amendments += 1
    public.amendments = published

    return public, Withheld(findings=held_findings, amendments=held_amendments)


# §7: sentence case, active voice, and no suggestion that anything went wrong.
# A held item is one a person has not read yet, which is the normal state of a
# fresh run and must not read as an error or as a hint of something scandalous.
HELD_NOTICE = (
    "Some findings in this report are being read by a person before they are shown here."
)

# Written so that neither reading is available to someone scanning it: not "an
# author has objected" (we do not know that anyone here is an author) and not "a
# statement was rejected" (nothing has been decided). It says only what is true —
# something arrived and has not been read.
HELD_AMENDMENT_NOTICE = (
    "Statements about this report are being read by a person before they are shown here."
)


def held_notice(held: Withheld | int) -> str:
    """The one line a public report shows when it is withholding something.

    Accepts a plain count for the finding-only case, so a caller that has one
    number does not have to construct a `Withheld` to ask.
    """
    counts = Withheld(findings=held) if isinstance(held, int) else held

    sentences: list[str] = []
    if counts.findings == 1:
        sentences.append(
            "One finding in this report is being read by a person before it is shown here."
        )
    elif counts.findings > 1:
        sentences.append(HELD_NOTICE)

    if counts.amendments == 1:
        sentences.append(
            "A statement about this report is being read by a person before it is shown here."
        )
    elif counts.amendments > 1:
        sentences.append(HELD_AMENDMENT_NOTICE)

    return " ".join(sentences)


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
    "AmendmentDeclineReason",
    "DECLINE_LABEL",
    "HELD_AMENDMENT_NOTICE",
    "HELD_NOTICE",
    "ReleaseRequiresReview",
    "ReviewEntry",
    "ReviewKind",
    "ReviewQueue",
    "ReviewState",
    "SUPPRESSION_LABEL",
    "Withheld",
    "SUPPRESSIONS_DIR",
    "SuppressionReason",
    "fixture_name",
    "held_notice",
    "is_gated",
    "read_negative_fixtures",
    "redact",
    "write_negative_fixture",
]
