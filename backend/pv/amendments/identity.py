"""The identity of one finding, so a contest can be attached to it (§14.5).

`CheckResult.fingerprint` identifies a whole check's result over every claim it
evaluated. A contest is narrower than that: an author disputes one number in one
cell, not everything the bold check said about their paper. This module derives
the per-finding identity, using the same function and the same components §14.5
fixes for a result:

    fingerprint(content_hash, checker, checker_version, policy_version)

The checker and policy versions are in there deliberately, and it is worth being
explicit about what that buys, because it looks like an inconvenience:

    An amendment stops applying the moment the judgement it answers changes.

If we fix the bold check and bump `CHECKER_VERSION`, every fingerprint under that
checker changes, and an author's objection to the old judgement no longer
resolves against the new one. That is correct. The objection was made about a
specific reading of their paper under a specific tolerance policy. Carrying it
forward onto a different reading would put words in their mouth — it would show a
contest of a finding they have never seen. `store.py` relies on this; so does
`recheck.py`, which treats a fingerprint that no longer resolves as the signal
that there is real work to do rather than as an error.

`Finding` carries no fingerprint on the contract, so it is computed here rather
than read. Everything it is computed from is on the contract and on the wire, so
the frontend and the backend derive the same value from the same report without
either of them storing it.
"""

from __future__ import annotations

from hashlib import sha256

from ..fingerprint import fingerprint
from ..models import Amendment, CheckResult, Finding, RunReport

# Same separator as `pv.fingerprint`: it cannot occur in any component, so
# ("a", "bc") and ("ab", "c") can never collide.
_SEP = "\x00"


def finding_content_hash(finding: Finding) -> str:
    """The identity of what a finding asserts, independent of when it was made.

    Included, and why:
      `anchor.kind`, `anchor.dom_id`  where in the paper this is about
      `verbatim`                      the paper's own words, when it has any
      `claimed`, `computed`           the two numbers the finding compares
      `severity`                      the review gate (§14.8) turns on it, so a
                                      finding downgraded from high to medium is a
                                      different judgement and must not silently
                                      inherit a contest of the stronger one

    Excluded, and why:
      `siglum`      positional, reassigned on every run, explicitly not an
                    identity (see `pv.siglum`). Including it would break every
                    amendment whenever a paper gained a finding earlier in
                    document order.
      `delta`       derived from `claimed` and `computed`; hashing it twice adds
                    nothing and would break identity on a formatting change.
      `explanation` our sentence about the finding, not the finding. We must be
                    able to rewrite our own prose without orphaning an author's
                    objection to the substance.
    """
    return sha256(
        _SEP.join(
            [
                finding.anchor.kind,
                finding.anchor.dom_id,
                finding.verbatim,
                finding.claimed or "",
                finding.computed or "",
                finding.severity.value,
            ]
        ).encode("utf-8")
    ).hexdigest()


def finding_fingerprint(check: CheckResult, finding: Finding) -> str:
    """The identity of one judgement about one claim. What an amendment keys on.

    `artifact_commit` is left empty: `CheckResult` does not carry the commit a
    check ran against, so there is nothing here to pass. When it does, thread it
    through — a finding about code that ran at a different commit is a different
    finding, and today's fingerprint cannot say so.
    """
    return fingerprint(
        finding_content_hash(finding),
        check.checker,
        check.checker_version,
        check.policy_version,
    )


def locate_finding(
    report: RunReport, fingerprint_hex: str
) -> tuple[CheckResult, Finding] | None:
    """The check and finding a fingerprint names in this report, or None.

    None is a normal answer, not a failure: it is what a caller sees when a
    checker has been improved since the amendment was filed. `recheck.py` reads
    it that way.
    """
    for check in report.checks:
        for finding in check.findings:
            if finding_fingerprint(check, finding) == fingerprint_hex:
                return check, finding
    return None


def fingerprints_in(report: RunReport) -> dict[str, tuple[CheckResult, Finding]]:
    """Every finding in a report, keyed by fingerprint. Built once per request
    rather than rescanning the report per lookup."""
    out: dict[str, tuple[CheckResult, Finding]] = {}
    for check in report.checks:
        for finding in check.findings:
            out[finding_fingerprint(check, finding)] = (check, finding)
    return out


# --------------------------------------------------------------------------
# The identity of an amendment
# --------------------------------------------------------------------------


def amendment_fingerprint(amendment: Amendment) -> str:
    """The identity of one statement, so the review gate can hold it.

    Deliberately **not** built the way a finding's identity is. A finding's
    fingerprint carries the checker and policy versions, so improving a check
    detaches an objection to it. An amendment carries neither, because it is not
    a judgement of ours: it is someone's words, and re-queueing every statement
    for review because we renumbered a checker would be absurd — and worse, would
    silently unpublish statements a person had already read and released.

    An amendment is identified by what it says and when it arrived. The log is
    append-only, so those two together are stable for the life of the row: a
    superseding row from a recheck carries a later `submitted_at` and is a
    separate item to review, which is correct — it carries a `resolution_note`
    nobody has read yet.
    """
    return sha256(
        _SEP.join(
            [
                amendment.finding_fingerprint,
                amendment.submitted_at.isoformat() if amendment.submitted_at else "",
                amendment.author_statement,
                amendment.corrected_value or "",
                amendment.resolution_note,
            ]
        ).encode("utf-8")
    ).hexdigest()


__all__ = [
    "amendment_fingerprint",
    "finding_content_hash",
    "finding_fingerprint",
    "fingerprints_in",
    "locate_finding",
]
