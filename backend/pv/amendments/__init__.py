"""The author response flow (brief Part 2, item 1).

What happens when we are wrong about someone in public.

Six false positives have already been caught in this codebase before shipping,
each one a paper that would have been marked as diverging when it was not. This
package is what handles the seventh, the one that gets through: an author reads a
finding about their own paper, disagrees with it, and says so — on the record,
attached to the exact judgement they are contesting.

Three rules hold the whole thing together:

**Append-only.** An amendment never edits or deletes the finding it answers. It
supersedes it in the reader's view. The same is true of amendments among
themselves: a recheck or a resolution appends a new row rather than rewriting the
one before it, so the sequence of what was said and when survives intact.

**Keyed on the judgement, not the row.** `Amendment.finding_fingerprint` is a
§14.5 fingerprint over (finding content, checker, checker version, policy
version). Bump a checker or a policy and every fingerprint under it changes, so a
contest correctly stops applying to a judgement it was never made about. See
`identity.py`.

**Rechecking is a cache lookup first.** §14.5 exists so that re-running looks up
fingerprints and executes only the misses. A recheck against an unchanged checker
has its answer already; only a recheck against a checker that has moved since the
run does any work, and even then it re-runs one check, not the paper.
"""

from __future__ import annotations

from .identity import finding_fingerprint, locate_finding
from .recheck import RecheckOutcome, recheck_finding
from .store import AmendmentStore

__all__ = [
    "AmendmentStore",
    "RecheckOutcome",
    "finding_fingerprint",
    "locate_finding",
    "recheck_finding",
]
