"""Every statement the store issues, as pure `(sql, params)` builders.

No driver import, no connection, no I/O. That is what makes the SQL testable with
no database — and there is no database yet, so it is also the only way this
layer could be written at all.

Two conventions hold throughout:

  Parameters are always parameters. Nothing here interpolates a value into a
  statement, including run ids, which arrive from a URL path.

  jsonb is passed as a JSON *string* with an explicit `::jsonb` cast rather than
  through a driver adapter. The models are Pydantic and already know how to
  serialise themselves; going through `model_dump_json` keeps one serialiser in
  the system instead of two that agree until they don't.
"""

from __future__ import annotations

import json
from typing import Any

Statement = tuple[str, tuple[Any, ...]]


def _json(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)


# --------------------------------------------------------------------------
# runs
# --------------------------------------------------------------------------

RUN_COLUMNS = (
    "run_id, paper_id, artifact_id, arxiv_id, version, title, status, stage, "
    "manifest, artifact_candidates, artifact, artifact_deadline, tables_parsed, "
    "started_at, finished_at"
)


def insert_run(
    run_id: str,
    arxiv_id: str,
    *,
    version: str | None,
    manifest: dict,
    status: str = "queued",
    stage: str = "queued",
) -> Statement:
    return (
        "INSERT INTO runs (run_id, arxiv_id, version, manifest, status, stage) "
        "VALUES (%s, %s, %s, %s::jsonb, %s, %s) "
        # A run id is a uuid4 hex we issued, so a conflict means a retry of a
        # request we already accepted. Returning the existing row is the
        # idempotent answer; failing would create a second run for one submission.
        "ON CONFLICT (run_id) DO NOTHING",
        (run_id, arxiv_id, version, _json(manifest), status, stage),
    )


def update_run_state(
    run_id: str,
    *,
    status: str,
    stage: str,
    title: str,
    tables_parsed: int,
    started_at: Any,
    finished_at: Any,
    artifact: dict | None,
    artifact_candidates: list,
    artifact_deadline: Any,
) -> Statement:
    """The run's lifecycle columns.

    `runs` is the one table here that is updated in place, and only in these
    columns: a run moves queued -> running -> complete, which is a state machine,
    not a judgement. Nothing it records *about a paper* is rewritten — the
    findings live in `checks` and `findings`, which reject an UPDATE at the
    database.
    """
    return (
        "UPDATE runs SET status = %s, stage = %s, title = %s, tables_parsed = %s, "
        "started_at = %s, finished_at = %s, artifact = %s::jsonb, "
        "artifact_candidates = %s::jsonb, artifact_deadline = %s "
        "WHERE run_id = %s",
        (
            status,
            stage,
            title,
            tables_parsed,
            started_at,
            finished_at,
            None if artifact is None else _json(artifact),
            _json(artifact_candidates),
            artifact_deadline,
            run_id,
        ),
    )


def select_run(run_id: str) -> Statement:
    return (f"SELECT {RUN_COLUMNS} FROM runs WHERE run_id = %s", (run_id,))


def select_recent_runs(limit: int) -> Statement:
    return (
        f"SELECT {RUN_COLUMNS} FROM runs ORDER BY created_at DESC, run_id DESC LIMIT %s",
        (limit,),
    )


# --------------------------------------------------------------------------
# checks and findings
# --------------------------------------------------------------------------

CHECK_COLUMNS = (
    "id, run_id, idx, claim_id, checker, checker_version, policy_version, "
    "fingerprint, verdict, reason, provenance, display_name, description, "
    "duration_ms, created_at"
)


def insert_check(
    run_id: str,
    *,
    claim_id: str,
    checker: str,
    checker_version: str,
    policy_version: str,
    fingerprint: str,
    verdict: str,
    reason: str | None,
    provenance: str,
    display_name: str,
    description: str,
    duration_ms: int | None,
    created_at: Any,
) -> Statement:
    """Append one check result and take the next position within the run.

    `idx` is derived in the statement rather than passed in, so the position is
    assigned by the database that holds the rows and not by whichever process
    happened to count them. The unique index on (run_id, idx) is what makes that
    safe under two writers: the loser gets a conflict and retries, rather than
    two checks quietly sharing position 4 and an SSE replay dropping one.
    """
    return (
        "INSERT INTO checks ("
        "  run_id, idx, claim_id, checker, checker_version, policy_version,"
        "  fingerprint, verdict, reason, provenance, display_name, description,"
        "  duration_ms, created_at"
        ") VALUES ("
        "  %s,"
        "  (SELECT coalesce(max(idx) + 1, 0) FROM checks WHERE run_id = %s),"
        "  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now())"
        ") RETURNING id, idx",
        (
            run_id,
            run_id,
            claim_id,
            checker,
            checker_version,
            policy_version,
            fingerprint,
            verdict,
            reason,
            provenance,
            display_name,
            description,
            duration_ms,
            created_at,
        ),
    )


def insert_finding(
    check_id: Any,
    ordinal: int,
    *,
    severity: str,
    siglum: str,
    claimed: str | None,
    computed: str | None,
    delta: str | None,
    anchor: dict,
    verbatim: str,
    explanation: str,
    fingerprint: str,
) -> Statement:
    return (
        "INSERT INTO findings ("
        "  check_id, ordinal, severity, siglum, claimed, computed, delta,"
        "  anchor, verbatim, explanation, fingerprint"
        ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)",
        (
            check_id,
            ordinal,
            severity,
            siglum,
            claimed,
            computed,
            delta,
            _json(anchor),
            verbatim,
            explanation,
            fingerprint,
        ),
    )


def select_checks(run_id: str, *, since_idx: int | None = None) -> Statement:
    """Every check in a run, in the order a live subscriber saw them.

    `since_idx` is what the LISTEN/NOTIFY listener uses: a notification says a
    row landed, and the listener reads forward from what it already has rather
    than re-reading the run.
    """
    if since_idx is None:
        return (
            f"SELECT {CHECK_COLUMNS} FROM checks WHERE run_id = %s ORDER BY idx",
            (run_id,),
        )
    return (
        f"SELECT {CHECK_COLUMNS} FROM checks WHERE run_id = %s AND idx > %s ORDER BY idx",
        (run_id, since_idx),
    )


def select_findings(run_id: str) -> Statement:
    """Findings for a whole run, joined to their check's position.

    One query for the run rather than one per check: a report with thirty checks
    should cost two round trips, not thirty-one.
    """
    return (
        "SELECT c.idx, f.ordinal, f.severity, f.siglum, f.claimed, f.computed, "
        "       f.delta, f.anchor, f.verbatim, f.explanation "
        "FROM findings f JOIN checks c ON c.id = f.check_id "
        "WHERE c.run_id = %s ORDER BY c.idx, f.ordinal",
        (run_id,),
    )


def select_stale_checks(checker: str, checker_version: str, limit: int = 1000) -> Statement:
    """§14.5 step 2: checks produced by a version of a checker that is no longer
    current. This is the backfill's selection, and the reason `fingerprint` is
    indexed — bump `CHECKER_VERSION`, select the old rows, enqueue only those,
    append new ones. Accuracy compounds without reprocessing the corpus."""
    return (
        "SELECT DISTINCT run_id, claim_id FROM checks "
        "WHERE checker = %s AND checker_version <> %s LIMIT %s",
        (checker, checker_version, limit),
    )


def select_by_fingerprint(fingerprints: list[str]) -> Statement:
    """§14.5 step 1: which of these judgements do we already hold?

    A hit means the exact inputs have been evaluated before, so the stored
    verdict stands and the check is not re-run.
    """
    return (
        f"SELECT {CHECK_COLUMNS} FROM checks WHERE fingerprint = ANY(%s)",
        (list(fingerprints),),
    )


def select_current_checks(run_id: str) -> Statement:
    """The standing result per (claim_id, checker): highest `checker_version`,
    then the latest row at that version.

    The append-only read. Superseded rows stay on the record and stay out of the
    report — nothing is deleted to make this query simpler.
    """
    return (
        "SELECT DISTINCT ON (claim_id, checker) " + CHECK_COLUMNS + " "
        "FROM checks WHERE run_id = %s "
        "ORDER BY claim_id, checker, checker_version DESC, idx DESC",
        (run_id,),
    )


# --------------------------------------------------------------------------
# not_checked
# --------------------------------------------------------------------------


def insert_not_checked(
    run_id: str, ordinal: int, *, what: str, reason_code: str, detail: str, siglum: str
) -> Statement:
    return (
        "INSERT INTO not_checked (run_id, ordinal, what, reason_code, detail, siglum) "
        "VALUES (%s, %s, %s, %s, %s, %s) "
        # A run's aggregation stage can be replayed after a restart. The list is
        # positional and derived from the same report, so a repeat is the same
        # row; recording it twice would double every entry in §5.5.
        "ON CONFLICT (run_id, ordinal) DO NOTHING",
        (run_id, ordinal, what, reason_code, detail, siglum),
    )


def select_not_checked(run_id: str) -> Statement:
    return (
        "SELECT what, reason_code, detail, siglum FROM not_checked "
        "WHERE run_id = %s ORDER BY ordinal",
        (run_id,),
    )


# --------------------------------------------------------------------------
# amendments
# --------------------------------------------------------------------------

AMENDMENT_COLUMNS = (
    "finding_fingerprint, claim_id, submitted_at, author_statement, "
    "corrected_value, status, recheck_result_fingerprint, resolution_note"
)


def insert_amendment(
    run_id: str,
    *,
    finding_fingerprint: str,
    fingerprint: str,
    claim_id: str,
    author_statement: str,
    corrected_value: str | None,
    status: str,
    recheck_result_fingerprint: str | None,
    resolution_note: str,
    submitted_at: Any,
) -> Statement:
    return (
        "INSERT INTO amendments ("
        "  run_id, finding_fingerprint, fingerprint, claim_id, author_statement,"
        "  corrected_value, status, recheck_result_fingerprint, resolution_note,"
        "  submitted_at"
        ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now())) "
        "RETURNING seq, submitted_at",
        (
            run_id,
            finding_fingerprint,
            fingerprint,
            claim_id,
            author_statement,
            corrected_value,
            status,
            recheck_result_fingerprint,
            resolution_note,
            submitted_at,
        ),
    )


def select_amendments(run_id: str) -> Statement:
    """Every row, oldest first. Not the latest per finding: a reader has to be
    able to see the objection, the recheck, and the outcome as a sequence."""
    return (
        f"SELECT {AMENDMENT_COLUMNS} FROM amendments WHERE run_id = %s ORDER BY seq",
        (run_id,),
    )


def select_amendments_for_finding(run_id: str, finding_fingerprint: str) -> Statement:
    return (
        f"SELECT {AMENDMENT_COLUMNS} FROM amendments "
        "WHERE run_id = %s AND finding_fingerprint = %s ORDER BY seq",
        (run_id, finding_fingerprint),
    )


# --------------------------------------------------------------------------
# review decisions
# --------------------------------------------------------------------------


def insert_review_decision(
    run_id: str,
    *,
    arxiv_id: str,
    kind: str,
    fingerprint: str,
    state: str,
    reason: str | None,
    note: str,
    decided_by: str,
    decided_at: Any,
) -> Statement:
    """Append a decision. Never an UPDATE: a reviewer who releases a finding and
    later suppresses it leaves both rows, and "who released this, and when" stays
    answerable."""
    return (
        "INSERT INTO review_decisions ("
        "  run_id, arxiv_id, kind, fingerprint, state, reason, note, decided_by,"
        "  decided_at"
        ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now())) "
        "RETURNING seq, decided_at",
        (
            run_id,
            arxiv_id,
            kind,
            fingerprint,
            state,
            reason,
            note,
            decided_by,
            decided_at,
        ),
    )


def select_decisions(run_id: str) -> Statement:
    """The standing decision per (kind, fingerprint) for one run.

    A fingerprint with no row is held, and that is not represented here — absence
    is the answer. A finding whose review row was lost is held for the same
    reason a finding nobody has looked at is held, which is the property that
    makes the gate safe to depend on.
    """
    return (
        "SELECT DISTINCT ON (kind, fingerprint) "
        "  kind, fingerprint, state, reason, note, decided_by, decided_at "
        "FROM review_decisions WHERE run_id = %s "
        "ORDER BY kind, fingerprint, seq DESC",
        (run_id,),
    )


__all__ = [
    "AMENDMENT_COLUMNS",
    "CHECK_COLUMNS",
    "RUN_COLUMNS",
    "Statement",
    "insert_amendment",
    "insert_check",
    "insert_finding",
    "insert_not_checked",
    "insert_review_decision",
    "insert_run",
    "select_amendments",
    "select_amendments_for_finding",
    "select_by_fingerprint",
    "select_checks",
    "select_current_checks",
    "select_decisions",
    "select_findings",
    "select_not_checked",
    "select_recent_runs",
    "select_run",
    "select_stale_checks",
    "update_run_state",
]
