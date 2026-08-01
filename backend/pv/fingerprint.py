"""Content addressing for claims and check results (§14.1, §14.5).

Orchestrator-owned, alongside `models.py`. Both functions are pure and stable —
changing either invalidates every stored fingerprint, so treat them as contract.

The invariant they exist to serve:

    verdict = f(claim_content_hash, checker_version, policy_version, artifact_commit)

Same inputs, same verdict, forever. That is what lets a finding published about a
named researcher be defended a year later: the exact inputs that produced it can
be reconstructed and re-run.
"""

from __future__ import annotations

from hashlib import sha256

# Separator that cannot occur in any component, so ("a", "bc") and ("ab", "c")
# can never collide.
_SEP = "\x00"


def _digest(*parts: str) -> str:
    return sha256(_SEP.join(parts).encode("utf-8")).hexdigest()


def claim_content_hash(kind: str, dom_id: str, verbatim: str, value: float | None) -> str:
    """The identity of a claim, independent of when or how it was checked.

    `value` is formatted with `repr` so that 41.8 and 41.80 hash identically —
    they are the same number, and a claim's identity should not change because a
    parser started reporting more trailing zeros.
    """
    return _digest(kind, dom_id, verbatim, "" if value is None else repr(float(value)))


def fingerprint(
    claim_content_hash: str,
    checker: str,
    checker_version: str,
    policy_version: str,
    artifact_commit: str | None = None,
) -> str:
    """The identity of a judgement. Stored on every CheckResult.

    Re-running a paper looks these up and executes only the misses. Bumping
    CHECKER_VERSION changes every fingerprint for that checker, which is exactly
    how a backfill is scoped: select the old version, enqueue only those.
    """
    return _digest(
        claim_content_hash,
        checker,
        checker_version,
        policy_version,
        artifact_commit or "",
    )
