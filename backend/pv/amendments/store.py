"""Append-only amendment log, one list per run.

Process-local and in memory, matching `pv.api.store.RunStore`: Docker is not
installed, so there is no Postgres yet. This holds the shape the `amendments`
table will hold, with the same rule the `checks` table has — a row is appended
once and never mutated. When Postgres arrives this file is replaced by a
repository with the same four methods and nothing above it changes.

The append-only rule is stricter here than it is for check results, and for a
different reason. A check result is append-only so a verdict can be defended a
year later. An amendment is append-only because it is *someone else's words about
us*. Rewriting a row to mark it resolved would let the operator of this system
edit an author's objection after the fact, and there is no version of that which
is defensible. A resolution is a new row that supersedes the one before it, and
both stay on the record.

Reading, therefore, has two shapes and both are used:
  `history`   every row, oldest first — what the report renders, so a reader sees
              the objection, the recheck, and the outcome as a sequence.
  `current`   the last row per fingerprint — what a Discrepancy row consults to
              know whether it has been contested.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timezone

from ..models import Amendment

# Same order of magnitude as RunStore.max_runs. A bound exists so a long-lived
# process cannot grow without limit; it is not a retention policy, and it will
# not be one once these rows live in Postgres.
DEFAULT_MAX_RUNS = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AmendmentStore:
    """Amendments for every run this process knows about. Append-only."""

    def __init__(self, max_runs: int = DEFAULT_MAX_RUNS) -> None:
        self.max_runs = max_runs
        self._by_run: "OrderedDict[str, list[Amendment]]" = OrderedDict()

    # -- writes -----------------------------------------------------------

    def append(self, run_id: str, amendment: Amendment) -> Amendment:
        """Record one amendment against one judgement.

        `submitted_at` is stamped here when the caller left it unset, so the
        timestamp on the record is when we received the statement rather than
        whatever a client claimed.
        """
        if amendment.submitted_at is None:
            amendment = amendment.model_copy(update={"submitted_at": _now()})
        log = self._by_run.setdefault(run_id, [])
        log.append(amendment)
        self._by_run.move_to_end(run_id)
        while len(self._by_run) > self.max_runs:
            self._by_run.popitem(last=False)
        return amendment

    def supersede(self, run_id: str, previous: Amendment, **changes) -> Amendment:
        """Append a new row carrying `previous` forward with `changes` applied.

        The mechanism behind "an amendment never edits anything, including
        itself". The author's statement is copied verbatim onto the new row: it
        is the thing being carried forward, and a resolution that dropped it
        would leave the record showing our answer without their question.
        """
        return self.append(
            run_id,
            previous.model_copy(update={**changes, "submitted_at": _now()}),
        )

    # -- reads ------------------------------------------------------------

    def history(self, run_id: str) -> list[Amendment]:
        """Every amendment for this run, oldest first. What the report renders."""
        return list(self._by_run.get(run_id, ()))

    def for_finding(self, run_id: str, fingerprint: str) -> list[Amendment]:
        """Every amendment against one judgement, oldest first."""
        return [
            a for a in self._by_run.get(run_id, ()) if a.finding_fingerprint == fingerprint
        ]

    def current(self, run_id: str) -> dict[str, Amendment]:
        """The standing amendment per fingerprint — the last row for each.

        A Discrepancy row consults this to know whether it has been contested.
        Earlier rows are not superseded in storage, only in this view, which is
        the distinction the whole module rests on.
        """
        out: dict[str, Amendment] = {}
        for amendment in self._by_run.get(run_id, ()):
            out[amendment.finding_fingerprint] = amendment
        return out

    def latest(self, run_id: str, fingerprint: str) -> Amendment | None:
        return self.current(run_id).get(fingerprint)


__all__ = ["AmendmentStore", "DEFAULT_MAX_RUNS"]
