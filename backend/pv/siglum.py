"""Sigla: the short marks that let a reader follow one claim across four surfaces.

Orchestrator-owned, alongside `models.py` and `fingerprint.py`.

A textual editor citing manuscript variants gives each witness a siglum, a one- or
two-letter mark, and uses it everywhere that witness is mentioned. We do the same:
the mark in the document margin, the mark on the ledger row, the mark in the gutter,
and the mark in the exported PDF are all the same mark.

Assignment is positional and deterministic. It is *not* an identity: re-running a
paper after the parser changes can shift which finding is `c`. Use `fingerprint`
when you need identity that survives a version bump, and a siglum only for
navigation within one report.
"""

from __future__ import annotations

from pv.models import RunReport

_ALPHABET = "abcdefghijklmnopqrstuvwxyz"


def nth(index: int) -> str:
    """0 -> a, 25 -> z, 26 -> aa, 27 -> ab.

    Bijective base-26, so there is no `a` that also means `aa` and no gap at 26.
    """
    if index < 0:
        raise ValueError("siglum index must be non-negative")
    out = ""
    n = index + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = _ALPHABET[rem] + out
    return out


def assign(report: RunReport) -> RunReport:
    """Give every finding and every not-checked entry a siglum, in report order.

    Findings come first, in check order and then in the order each check produced
    them, which is document order because the checks walk claims in document order.
    Not-checked entries continue the same sequence rather than starting a new one,
    so no two rows in a report share a mark.

    Mutates and returns the report. Idempotent: running it twice gives the same
    marks, and a report that already carries sigla is reassigned identically.
    """
    i = 0
    for check in report.checks:
        for finding in check.findings:
            finding.siglum = nth(i)
            i += 1
    for entry in report.not_checked:
        entry.siglum = nth(i)
        i += 1
    return report
