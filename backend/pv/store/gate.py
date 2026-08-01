"""The review gate's decisions, in Postgres (§14.8).

`pv.review.ReviewQueue` holds these in a dict today. This subclass keeps every
rule that file establishes and changes only where the decisions live, because the
rules are the part that matters:

  Absence means held. A fingerprint with no row is held, and a row that says
  `held` does not exist — `review_decisions` will not accept the value. That is
  what makes the gate safe to depend on across processes: a decision lost, a
  replica lagging, a query that returned nothing, and a fresh run all produce the
  same answer, which is that nobody has read it yet.

  Only decisions are stored. What is *waiting* is derived from the report each
  time it is asked for, so a finding cannot be held in a list that has fallen out
  of step with what the run actually produced. The derivation stays in
  `review.py`; this class calls it and overlays what the table knows.

  A finding and the amendment contesting it are two decisions. The kind is part
  of the key, in the table and here. Releasing one must never release the other,
  or contesting a finding would become the way to bury it.
"""

from __future__ import annotations

from ..review import (
    AmendmentDeclineReason,
    ReleaseRequiresReview,
    ReviewEntry,
    ReviewKind,
    ReviewQueue,
    ReviewState,
    SuppressionReason,
    write_negative_fixture,
)
from . import codec, sql
from .db import Database


def _reason(kind: ReviewKind, raw: str | None):
    """The stored reason as its enum, or None when this build does not know it.

    None rather than a guess: the two vocabularies say opposite things — a
    suppression says we read a paper wrong, a decline says nothing about the
    paper at all — and rendering one as the other would put a claim about a
    researcher's work next to a decision that was never about it.
    """
    if raw is None:
        return None
    table = SuppressionReason if kind is ReviewKind.FINDING else AmendmentDeclineReason
    try:
        return table(raw)
    except ValueError:
        return None


class PgReviewQueue(ReviewQueue):
    """Decisions in `review_decisions`; the queue itself still derived."""

    def __init__(self, db: Database, suppressions_dir=None) -> None:
        # `_decisions` stays empty for the life of this object. The base class
        # consults it during derivation, and an entry there would shadow the
        # table with a copy this process happened to write.
        if suppressions_dir is None:
            super().__init__()
        else:
            super().__init__(suppressions_dir=suppressions_dir)
        self.db = db

    # -- reads ------------------------------------------------------------

    def _decisions_for(self, run_id: str) -> dict[tuple[ReviewKind, str], dict]:
        out: dict[tuple[ReviewKind, str], dict] = {}
        for row in self.db.fetchall(sql.select_decisions(run_id)):
            kind_raw, fingerprint, state, reason, note, decided_by, decided_at = row
            try:
                kind = ReviewKind(kind_raw)
                review_state = ReviewState(state)
            except ValueError:
                # A state this build cannot name is not released. Skipping the
                # row leaves the item held, which is the safe direction and the
                # only one available: publishing on an unreadable decision is
                # exactly what the gate exists to prevent.
                continue
            out[(kind, fingerprint)] = {
                "state": review_state,
                "reason": _reason(kind, reason),
                "note": note or "",
                "decided_by": decided_by or "",
                "decided_at": codec.utc(decided_at),
            }
        return out

    def state_of(
        self, run_id: str, fingerprint: str, kind: ReviewKind = ReviewKind.FINDING
    ) -> ReviewState:
        decision = self._decisions_for(run_id).get((kind, fingerprint))
        return decision["state"] if decision else ReviewState.HELD

    def pending(self, run_id: str, report) -> list[ReviewEntry]:
        """Derived from the report, then overlaid with what has been decided.

        A released item stays in the list with `state: released`: the queue is
        the record of what was reviewed, not only of what is outstanding.
        """
        entries = super().pending(run_id, report)
        decisions = self._decisions_for(run_id)
        for entry in entries:
            decision = decisions.get((entry.kind, entry.fingerprint))
            if decision is None:
                continue
            entry.state = decision["state"]
            entry.reason = decision["reason"]
            entry.note = decision["note"]
            entry.decided_by = decision["decided_by"]
            entry.decided_at = decision["decided_at"]
        return entries

    # -- writes -----------------------------------------------------------

    def _record(
        self,
        entry: ReviewEntry,
        *,
        state: ReviewState,
        reason,
        note: str,
        by: str,
    ) -> ReviewEntry:
        row = self.db.fetchone(
            sql.insert_review_decision(
                entry.run_id,
                arxiv_id=entry.arxiv_id,
                kind=entry.kind.value,
                fingerprint=entry.fingerprint,
                state=state.value,
                reason=reason.value if reason is not None else None,
                note=note,
                decided_by=by,
                decided_at=None,
            )
        )
        _seq, decided_at = row
        entry.state = state
        entry.reason = reason
        entry.note = note
        entry.decided_by = by
        entry.decided_at = codec.utc(decided_at)
        return entry

    def release(
        self,
        run_id: str,
        report,
        fingerprint: str,
        *,
        kind: ReviewKind = ReviewKind.FINDING,
        by: str = "",
        note: str = "",
    ) -> ReviewEntry:
        """A person has read this and it may be published."""
        entry = self._locate(run_id, report, fingerprint, kind)
        return self._record(entry, state=ReviewState.RELEASED, reason=None, note=note, by=by)

    def decline(
        self,
        run_id: str,
        report,
        fingerprint: str,
        *,
        reason: AmendmentDeclineReason,
        note: str = "",
        by: str = "",
    ) -> ReviewEntry:
        """This statement is not published on the paper's page.

        Writes no negative fixture, for the reason `review.py` gives: a fixture
        records a judgement *we* made and withdrew. A statement we did not
        publish says nothing about a checker and must not be filed as though it
        were a defect we fixed. It deletes nothing either — the amendment stays
        in the append-only log and stays readable at `GET /runs/{id}/amendments`.
        """
        entry = self._locate(run_id, report, fingerprint, ReviewKind.AMENDMENT)
        return self._record(
            entry, state=ReviewState.SUPPRESSED, reason=reason, note=note, by=by
        )

    def suppress(
        self,
        run_id: str,
        report,
        fingerprint: str,
        *,
        reason: SuppressionReason,
        note: str = "",
        by: str = "",
        write_fixture: bool = True,
    ) -> ReviewEntry:
        """This finding is wrong. Never publish it, and never produce it again.

        The fixture is the second half of that sentence and is written to disk,
        not to the database, on purpose: a suppression is a regression test, it
        belongs in the repository under `fixtures/suppressions/`, and it has to
        fail a build. A row in a table nobody runs tests against fixes one URL.
        """
        entry = self._locate(run_id, report, fingerprint, ReviewKind.FINDING)
        self._record(entry, state=ReviewState.SUPPRESSED, reason=reason, note=note, by=by)
        if write_fixture:
            write_negative_fixture(entry, directory=self.suppressions_dir)
        return entry


__all__ = ["PgReviewQueue", "ReleaseRequiresReview"]
