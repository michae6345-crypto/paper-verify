"""Rows to contract types and back.

The one rule here: a value that came out of the database is turned into the
Pydantic model by the model, never by hand. `CheckResult(**row)` with a
hand-written column list is how a field added to `models.py` silently stops being
persisted — the insert keeps working, the read keeps working, and the field is
just gone. So conversion goes through `model_dump()` and `model_validate()`, and
the columns below are only the ones a query has to filter, sort, or join on.

Everything in this module is pure. No connection, no driver types.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..models import (
    Amendment,
    Anchor,
    CheckResult,
    Finding,
    NotChecked,
    ReasonCode,
    Severity,
    Verdict,
)


def _as_dict(value: Any) -> dict:
    """jsonb comes back as a dict from psycopg and as a string from anything that
    hands us raw text. Accept both rather than assuming a driver."""
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, str)):
        import json

        return json.loads(value)
    if value is None:
        return {}
    raise TypeError(f"Cannot read {type(value).__name__} as jsonb")


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------


def check_params(result: CheckResult, *, claim_id: str = "") -> dict[str, Any]:
    """Keyword arguments for `sql.insert_check`.

    `claim_id` is passed separately because `CheckResult` does not carry it: a
    result is about a check's whole evaluation, and the claim it evaluated is
    known to the caller that ran it. Empty is a normal value — checks 1, 2 and 6
    evaluate a table, a link and a bibliography respectively.
    """
    return {
        "claim_id": claim_id,
        "checker": result.checker,
        "checker_version": result.checker_version,
        "policy_version": result.policy_version,
        "fingerprint": result.fingerprint,
        "verdict": result.verdict.value,
        "reason": result.reason.value if result.reason else None,
        "provenance": result.provenance,
        "display_name": result.display_name,
        "description": result.description,
        "duration_ms": result.duration_ms,
        "created_at": result.created_at,
    }


def finding_params(finding: Finding, ordinal: int, fingerprint: str) -> dict[str, Any]:
    return {
        "ordinal": ordinal,
        "severity": finding.severity.value,
        "siglum": finding.siglum,
        "claimed": finding.claimed,
        "computed": finding.computed,
        "delta": finding.delta,
        "anchor": finding.anchor.model_dump(mode="json"),
        "verbatim": finding.verbatim,
        "explanation": finding.explanation,
        "fingerprint": fingerprint,
    }


# Column order of `sql.CHECK_COLUMNS`.
_CHECK_FIELDS = (
    "id",
    "run_id",
    "idx",
    "claim_id",
    "checker",
    "checker_version",
    "policy_version",
    "fingerprint",
    "verdict",
    "reason",
    "provenance",
    "display_name",
    "description",
    "duration_ms",
    "created_at",
)


def check_row(row: tuple) -> dict[str, Any]:
    return dict(zip(_CHECK_FIELDS, row, strict=True))


def check_from_row(row: tuple, findings: list[Finding] | None = None) -> CheckResult:
    """One stored check, with its findings attached.

    The reason code is read back as a `ReasonCode` when we recognise it and
    dropped when we do not. Dropping is the honest outcome for a code written by
    a newer version of the app than the one reading: the alternative is to invent
    a reason, and a report that states the wrong reason for declining to judge a
    paper is worse than one that states none.
    """
    data = check_row(row)
    reason = data["reason"]
    if reason is not None and reason not in ReasonCode._value2member_map_:
        reason = None
    return CheckResult(
        checker=data["checker"],
        checker_version=data["checker_version"],
        policy_version=data["policy_version"] or "",
        fingerprint=data["fingerprint"] or "",
        verdict=Verdict(data["verdict"]),
        reason=ReasonCode(reason) if reason else None,
        provenance=data["provenance"],
        findings=list(findings or []),
        display_name=data["display_name"] or "",
        description=data["description"] or "",
        duration_ms=data["duration_ms"],
        created_at=data["created_at"],
    )


def finding_from_row(row: tuple) -> tuple[int, Finding]:
    """(check position, finding) from `sql.select_findings`."""
    idx, _ordinal, severity, siglum, claimed, computed, delta, anchor, verbatim, expl = row
    return idx, Finding(
        severity=Severity(severity),
        siglum=siglum or "",
        claimed=claimed,
        computed=computed,
        delta=delta,
        anchor=Anchor.model_validate(_as_dict(anchor)),
        verbatim=verbatim or "",
        explanation=expl or "",
    )


def findings_by_check(rows: list[tuple]) -> dict[int, list[Finding]]:
    out: dict[int, list[Finding]] = {}
    for row in rows:
        idx, finding = finding_from_row(row)
        out.setdefault(idx, []).append(finding)
    return out


# --------------------------------------------------------------------------
# not_checked
# --------------------------------------------------------------------------


def not_checked_params(entry: NotChecked, ordinal: int) -> dict[str, Any]:
    return {
        "ordinal": ordinal,
        "what": entry.what,
        "reason_code": entry.reason.value,
        "detail": entry.detail,
        "siglum": entry.siglum,
    }


def not_checked_from_row(row: tuple) -> NotChecked | None:
    """None when the reason code is one this build does not know.

    §5.5 is first-class UI and every reason needs a human-readable label; a code
    we have no label for would render as a raw identifier next to a researcher's
    paper. Skipping the row is visible in the count and does not invent text.
    """
    what, reason_code, detail, siglum = row
    if reason_code not in ReasonCode._value2member_map_:
        return None
    return NotChecked(
        what=what,
        reason=ReasonCode(reason_code),
        detail=detail or "",
        siglum=siglum or "",
    )


# --------------------------------------------------------------------------
# amendments
# --------------------------------------------------------------------------


def amendment_params(amendment: Amendment, fingerprint: str) -> dict[str, Any]:
    return {
        "finding_fingerprint": amendment.finding_fingerprint,
        "fingerprint": fingerprint,
        "claim_id": amendment.claim_id,
        "author_statement": amendment.author_statement,
        "corrected_value": amendment.corrected_value,
        "status": amendment.status,
        "recheck_result_fingerprint": amendment.recheck_result_fingerprint,
        "resolution_note": amendment.resolution_note,
        "submitted_at": amendment.submitted_at,
    }


def amendment_from_row(row: tuple) -> Amendment:
    (
        finding_fingerprint,
        claim_id,
        submitted_at,
        author_statement,
        corrected_value,
        status,
        recheck_result_fingerprint,
        resolution_note,
    ) = row
    return Amendment(
        finding_fingerprint=finding_fingerprint,
        claim_id=claim_id or "",
        submitted_at=submitted_at,
        author_statement=author_statement or "",
        corrected_value=corrected_value,
        status=status,
        recheck_result_fingerprint=recheck_result_fingerprint,
        resolution_note=resolution_note or "",
    )


# --------------------------------------------------------------------------
# runs
# --------------------------------------------------------------------------

# Column order of `sql.RUN_COLUMNS`.
_RUN_FIELDS = (
    "run_id",
    "paper_id",
    "artifact_id",
    "arxiv_id",
    "version",
    "title",
    "status",
    "stage",
    "manifest",
    "artifact_candidates",
    "artifact",
    "artifact_deadline",
    "tables_parsed",
    "started_at",
    "finished_at",
)


def run_row(row: tuple) -> dict[str, Any]:
    data = dict(zip(_RUN_FIELDS, row, strict=True))
    data["manifest"] = _as_dict(data["manifest"])
    candidates = data["artifact_candidates"]
    if isinstance(candidates, (bytes, str)):
        import json

        candidates = json.loads(candidates)
    data["artifact_candidates"] = list(candidates or [])
    if data["artifact"] is not None:
        data["artifact"] = _as_dict(data["artifact"])
    return data


def utc(value: datetime | None) -> datetime | None:
    """Postgres returns timestamptz already aware; a naive value from anywhere
    else is read as UTC rather than as local time, because a run's timestamps are
    part of the record of a judgement and a server's timezone is not."""
    if value is None or value.tzinfo is not None:
        return value
    from datetime import timezone

    return value.replace(tzinfo=timezone.utc)


__all__ = [
    "amendment_from_row",
    "amendment_params",
    "check_from_row",
    "check_params",
    "check_row",
    "finding_from_row",
    "finding_params",
    "findings_by_check",
    "not_checked_from_row",
    "not_checked_params",
    "run_row",
    "utc",
]
