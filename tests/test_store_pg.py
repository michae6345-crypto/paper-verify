"""The Postgres store (§14.9 step 5) and the shared event bus (§15.1).

Network-free and database-free by default, and that is not a compromise: there is
no live `DATABASE_URL` yet, so every property that can be established from the
SQL text and the pure builders is established here rather than deferred to the
day a connection string arrives.

What this suite is protecting, in order of how badly it would hurt to lose:

  - **Every table has RLS enabled in the migration that creates it.** The
    project's anon key is public by design, so a table without RLS is readable by
    anyone the moment the Data API is enabled — and `findings` holds exactly the
    high-severity divergences §14.8 is withholding from a permalink. A missing
    policy would route around the review gate entirely. This is a rule kept by
    remembering, which is the kind that gets forgotten in the migration written
    at speed six months from now, so it is a test.
  - **`review_decisions` cannot store `held`.** Absence means held. A row that
    could say `held` invites a reader that treats a missing row as anything else.
  - **checks, findings, not_checked, amendments and decisions reject UPDATE.**
    Append-only is enforced by a trigger, not by convention.
  - **The two implementations have the same surface.** A method on `RunStore`
    that `PgRunStore` lacks is a 500 the day the env var flips.

Tests needing a live connection are marked `needs_db` and skip when
`DATABASE_URL` is unset. They apply the migrations to the database that variable
points at, so point it at a branch database, never at production.
"""

from __future__ import annotations

import inspect
import json
import os
import re
from datetime import datetime, timezone

import pytest

from pv.amendments import AmendmentStore
from pv.api.store import RunRecord, RunStore
from pv.models import (
    EMBEDDING_DIM,
    Amendment,
    Anchor,
    CheckResult,
    Finding,
    NotChecked,
    ReasonCode,
    Severity,
    Verdict,
)
from pv.review import ReviewQueue, ReviewState
from pv.store import codec, config, migrate, sql
from pv.store.bus import channel_for, parse_payload, run_id_for

MIGRATIONS = migrate.discover()
ALL_SQL = "\n".join(m.sql for m in MIGRATIONS)

DATABASE_URL = os.getenv("DATABASE_URL", "")
needs_db = pytest.mark.skipif(
    not DATABASE_URL, reason="no DATABASE_URL; live-database test"
)


# --------------------------------------------------------------------------
# The migration set
# --------------------------------------------------------------------------


def test_migrations_are_a_contiguous_run_from_0001():
    assert [m.version for m in MIGRATIONS] == [
        f"{i:04d}" for i in range(1, len(MIGRATIONS) + 1)
    ]


def test_discover_rejects_a_gap(tmp_path):
    (tmp_path / "0001_core.sql").write_text("SELECT 1;", encoding="utf-8")
    (tmp_path / "0003_late.sql").write_text("SELECT 1;", encoding="utf-8")
    with pytest.raises(migrate.MigrationError, match="contiguous"):
        migrate.discover(tmp_path)


def test_discover_rejects_an_unnumbered_file(tmp_path):
    (tmp_path / "core.sql").write_text("SELECT 1;", encoding="utf-8")
    with pytest.raises(migrate.MigrationError, match="NNNN"):
        migrate.discover(tmp_path)


def test_an_applied_migration_may_not_change():
    """Forward-only. An edited migration means the database was built by SQL that
    no longer exists anywhere, so nothing downstream can be reproduced."""
    first = MIGRATIONS[0]
    with pytest.raises(migrate.MigrationError, match="forward-only"):
        migrate.pending({first.version: "a-different-checksum"}, MIGRATIONS)


def test_pending_returns_only_what_has_not_run():
    applied = {MIGRATIONS[0].version: MIGRATIONS[0].checksum}
    assert [m.version for m in migrate.pending(applied, MIGRATIONS)] == [
        m.version for m in MIGRATIONS[1:]
    ]


def test_no_migration_drops_or_deletes():
    """No down migrations, and no DDL that removes evidence. A verdict published
    about a named researcher has to be reconstructible a year later, which is
    only true while the rows behind it still exist."""
    body = "\n".join(
        line.split("--", 1)[0] for line in ALL_SQL.splitlines()
    ).upper()
    for forbidden in ("DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE"):
        assert forbidden not in body, f"{forbidden} in a forward-only migration"


# --------------------------------------------------------------------------
# Row level security
# --------------------------------------------------------------------------

EXPECTED_TABLES = {
    "papers",
    "tables",
    "claims",
    "artifacts",
    "runs",
    "checks",
    "findings",
    "not_checked",
    "amendments",
    "review_decisions",
}


def test_the_ten_tables_exist():
    assert set(migrate.tables_created(ALL_SQL)) == EXPECTED_TABLES


def test_every_table_enables_rls_in_the_migration_that_creates_it():
    """Not in a follow-up. Between a migration that creates a table and one that
    protects it there is a window in which the table is public, and on a hosted
    Postgres that window is however long the second migration takes to be
    written."""
    for migration in MIGRATIONS:
        created = set(migrate.tables_created(migration.sql))
        protected = set(migrate.tables_with_rls(migration.sql))
        assert created <= protected, (
            f"{migration} creates {sorted(created - protected)} without RLS"
        )


def test_there_are_no_policies():
    """Default deny, with nothing granted back.

    Every policy on these tables is a surface reachable by a key that ships in
    the browser. If one is ever justified it belongs on a view with redaction in
    its WHERE clause — never on `findings`, which holds the accusations §14.8 is
    still withholding.
    """
    assert migrate.policies(ALL_SQL) == []


def test_anon_and_authenticated_are_revoked_on_every_table():
    for table in EXPECTED_TABLES:
        assert re.search(rf"'{table}'", ALL_SQL), f"{table} missing from the REVOKE list"
    assert "REVOKE ALL ON TABLE public.%I FROM %I" in ALL_SQL


# --------------------------------------------------------------------------
# Append-only
# --------------------------------------------------------------------------

APPEND_ONLY = ("checks", "findings", "not_checked", "amendments", "review_decisions")


@pytest.mark.parametrize("table", APPEND_ONLY)
def test_append_only_tables_reject_update_and_delete(table):
    trigger = re.search(
        rf"CREATE TRIGGER {table}_append_only\s+BEFORE UPDATE OR DELETE ON {table}",
        ALL_SQL,
    )
    assert trigger, f"{table} has no append-only trigger"


def test_runs_is_the_only_mutable_table():
    """A run moves queued -> running -> complete, which is a state machine, not a
    judgement. Nothing it records about a paper is rewritten."""
    updated = {
        match.group(1)
        for match in re.finditer(r"UPDATE\s+([a-z_]+)\s+SET", "\n".join(
            source for source in _builder_sql()
        ))
    }
    assert updated == {"runs"}


def _builder_sql() -> list[str]:
    """Every statement the store can issue, from the builders themselves."""
    out: list[str] = []
    dummy = {
        "run_id": "r", "arxiv_id": "1706.03762", "version": None, "manifest": {},
        "claim_id": "", "checker": "c", "checker_version": "1", "policy_version": "",
        "fingerprint": "f", "verdict": "matches", "reason": None,
        "provenance": "extracted", "display_name": "", "description": "",
        "duration_ms": None, "created_at": None, "status": "queued", "stage": "queued",
        "title": "", "tables_parsed": 0, "started_at": None, "finished_at": None,
        "artifact": None, "artifact_candidates": [], "artifact_deadline": None,
    }
    out.append(sql.insert_run("r", "x", version=None, manifest={})[0])
    out.append(sql.update_run_state(**{k: dummy[k] for k in (
        "run_id", "status", "stage", "title", "tables_parsed", "started_at",
        "finished_at", "artifact", "artifact_candidates", "artifact_deadline",
    )})[0])
    out.append(sql.select_run("r")[0])
    out.append(sql.select_recent_runs(5)[0])
    out.append(sql.insert_check("r", **{k: dummy[k] for k in (
        "claim_id", "checker", "checker_version", "policy_version", "fingerprint",
        "verdict", "reason", "provenance", "display_name", "description",
        "duration_ms", "created_at",
    )})[0])
    out.append(
        sql.insert_finding(
            "id", 0, severity="high", siglum="a", claimed=None, computed=None,
            delta=None, anchor={}, verbatim="", explanation="", fingerprint="f",
        )[0]
    )
    out.append(sql.select_checks("r")[0])
    out.append(sql.select_checks("r", since_idx=1)[0])
    out.append(sql.select_findings("r")[0])
    out.append(sql.select_current_checks("r")[0])
    out.append(sql.select_stale_checks("c", "2")[0])
    out.append(sql.select_by_fingerprint(["f"])[0])
    out.append(
        sql.insert_not_checked("r", 0, what="w", reason_code="no_latex_source",
                               detail="", siglum="")[0]
    )
    out.append(sql.select_not_checked("r")[0])
    out.append(
        sql.insert_amendment(
            "r", finding_fingerprint="f", fingerprint="g", claim_id="",
            author_statement="", corrected_value=None, status="open",
            recheck_result_fingerprint=None, resolution_note="", submitted_at=None,
        )[0]
    )
    out.append(sql.select_amendments("r")[0])
    out.append(sql.select_amendments_for_finding("r", "f")[0])
    out.append(
        sql.insert_review_decision(
            "r", arxiv_id="x", kind="finding", fingerprint="f", state="released",
            reason=None, note="", decided_by="", decided_at=None,
        )[0]
    )
    out.append(sql.select_decisions("r")[0])
    return out


# --------------------------------------------------------------------------
# Schema details the contract depends on
# --------------------------------------------------------------------------


def test_the_embedding_column_matches_models_embedding_dim():
    assert f"vector({EMBEDDING_DIM})" in ALL_SQL


def test_pgvector_is_enabled_but_no_ann_index_is_built():
    """The column exists so the migration does not have to be rewritten for
    check 7. Nothing populates it — `sentence-transformers` drags in ~2GB of
    torch — and an IVFFlat index built on an empty table has bad recall forever.
    """
    assert "CREATE EXTENSION IF NOT EXISTS vector" in ALL_SQL
    assert "USING ivfflat" not in ALL_SQL
    assert "USING hnsw" not in ALL_SQL


def test_the_verdict_check_is_exactly_the_seven_vocabulary():
    """§7 fixes the vocabulary at five values. The constraint must not drift from
    the enum in either direction: a value missing here is a verdict the system
    can compute and cannot store."""
    constraint = re.search(r"verdict\s+text NOT NULL CHECK \(verdict IN \(([^)]*)\)\)", ALL_SQL)
    assert constraint
    listed = set(re.findall(r"'([a-z_]+)'", constraint.group(1)))
    assert listed == {v.value for v in Verdict}


def test_severity_matches_the_enum():
    constraint = re.search(r"severity\s+text NOT NULL DEFAULT 'medium'\s+CHECK \(severity IN \(([^)]*)\)\)", ALL_SQL)
    assert constraint
    assert set(re.findall(r"'([a-z]+)'", constraint.group(1))) == {s.value for s in Severity}


def test_reason_codes_are_not_constrained():
    """A new `ReasonCode` must never require a migration before an honest
    `unverifiable` can be written. Honest incompleteness is the product; a schema
    that made a new reason expensive would push a checker toward guessing."""
    assert not re.search(r"CHECK \(reason IN", ALL_SQL)
    assert not re.search(r"CHECK \(reason_code IN", ALL_SQL)


def test_review_decisions_cannot_store_held():
    """`held` is the default and is not representable. A finding whose review row
    was lost is held for the same reason a finding nobody has looked at is
    held."""
    constraint = re.search(r"state\s+text NOT NULL CHECK \(state IN \(([^)]*)\)\)", ALL_SQL)
    assert constraint
    states = set(re.findall(r"'([a-z]+)'", constraint.group(1)))
    assert states == {ReviewState.RELEASED.value, ReviewState.SUPPRESSED.value}
    assert ReviewState.HELD.value not in states


def test_a_suppression_must_carry_a_reason():
    """A suppression with no reason is an untraceable deletion, and an
    unexplained refusal to publish someone's words is what this flow exists to
    make impossible."""
    assert "review_suppression_needs_reason" in ALL_SQL


def test_the_fingerprint_is_indexed_on_checks():
    """§14.5's backfill selects on it, and the whole idempotency story rests on
    it."""
    assert "CREATE INDEX checks_fingerprint_idx ON checks (fingerprint)" in ALL_SQL


def test_kind_is_part_of_the_review_key():
    """A finding and the amendment contesting it are two decisions. Releasing one
    must never release the other, or contesting a finding would become the way to
    bury it."""
    assert "review_decisions (run_id, kind, fingerprint, seq DESC)" in ALL_SQL
    assert "ORDER BY kind, fingerprint, seq DESC" in sql.select_decisions("r")[0]


# --------------------------------------------------------------------------
# The builders
# --------------------------------------------------------------------------


def test_every_builder_binds_its_values():
    """Nothing is interpolated, including run ids, which arrive from a URL path."""
    for statement in _builder_sql():
        assert "'r'" not in statement
        assert "%(" not in statement  # positional style throughout, one convention


def test_placeholder_count_matches_parameter_count():
    for builder in (
        lambda: sql.insert_run("r", "x", version="v1", manifest={"a": 1}),
        lambda: sql.select_run("r"),
        lambda: sql.select_recent_runs(20),
        lambda: sql.select_checks("r"),
        lambda: sql.select_checks("r", since_idx=3),
        lambda: sql.select_findings("r"),
        lambda: sql.select_not_checked("r"),
        lambda: sql.select_amendments("r"),
        lambda: sql.select_decisions("r"),
        lambda: sql.select_by_fingerprint(["a", "b"]),
        lambda: sql.select_stale_checks("bold", "3"),
    ):
        statement, params = builder()
        assert statement.count("%s") == len(params), statement


def test_insert_check_lets_the_database_assign_the_position():
    statement, _ = sql.insert_check(
        "run", claim_id="", checker="bold", checker_version="1", policy_version="",
        fingerprint="f", verdict="matches", reason=None, provenance="extracted",
        display_name="", description="", duration_ms=None, created_at=None,
    )
    assert "coalesce(max(idx) + 1, 0)" in statement
    assert "RETURNING id, idx" in statement


def test_current_checks_takes_the_highest_version_per_claim_and_checker():
    """Append-only reading: a superseded row stays on the record and stays out of
    the report."""
    statement, _ = sql.select_current_checks("r")
    assert "DISTINCT ON (claim_id, checker)" in statement
    assert "checker_version DESC" in statement


def test_jsonb_goes_in_as_json_text_with_a_cast():
    statement, params = sql.insert_run("r", "x", version=None, manifest={"b": 2, "a": 1})
    assert "%s::jsonb" in statement
    assert json.loads(params[3]) == {"a": 1, "b": 2}


# --------------------------------------------------------------------------
# The codec
# --------------------------------------------------------------------------


def _anchor() -> Anchor:
    return Anchor(
        kind="table_cell",
        dom_id="tab:wmt-results/r7/c2",
        table_label="tab:wmt-results",
        row=7,
        col=2,
        human_locator='Table 2, row 7, column "EN-FR"',
    )


def _result() -> CheckResult:
    return CheckResult(
        checker="bold_is_max",
        checker_version="3",
        policy_version="1",
        fingerprint="f" * 64,
        verdict=Verdict.DIVERGES,
        reason=None,
        provenance="extracted",
        findings=[
            Finding(
                severity=Severity.HIGH,
                siglum="a",
                claimed="41.8",
                computed="41.0",
                delta="0.8",
                anchor=_anchor(),
                verbatim="41.8 BLEU on WMT 2014 English-to-French",
                explanation="The abstract and the table disagree with the body text.",
            )
        ],
        display_name="Bolded value is the block best",
        description="",
        duration_ms=12,
        created_at=datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
    )


def _check_row(result: CheckResult, idx: int = 0) -> tuple:
    params = codec.check_params(result)
    return (
        "some-uuid",
        "run",
        idx,
        params["claim_id"],
        params["checker"],
        params["checker_version"],
        params["policy_version"],
        params["fingerprint"],
        params["verdict"],
        params["reason"],
        params["provenance"],
        params["display_name"],
        params["description"],
        params["duration_ms"],
        params["created_at"],
    )


def test_a_check_survives_the_round_trip_with_its_findings():
    original = _result()
    findings_rows = [
        (
            0,
            0,
            "high",
            "a",
            "41.8",
            "41.0",
            "0.8",
            original.findings[0].anchor.model_dump(mode="json"),
            original.findings[0].verbatim,
            original.findings[0].explanation,
        )
    ]
    findings = codec.findings_by_check(findings_rows)
    restored = codec.check_from_row(_check_row(original), findings[0])
    assert restored == original


def test_the_row_column_order_matches_the_select():
    """A `SELECT` and a decoder that disagree by one column produce a report full
    of values in the wrong fields, and every one of them would render as a
    confident sentence about a paper."""
    columns = [c.strip() for c in sql.CHECK_COLUMNS.split(",")]
    assert tuple(columns) == codec._CHECK_FIELDS


def test_an_unknown_reason_code_is_dropped_rather_than_invented():
    row = list(_check_row(_result()))
    row[8] = "unverifiable"
    row[9] = "a_reason_from_a_newer_build"
    restored = codec.check_from_row(tuple(row))
    assert restored.verdict is Verdict.UNVERIFIABLE
    assert restored.reason is None


def test_an_unknown_not_checked_reason_is_skipped_rather_than_shown_raw():
    """§5.5 needs a human-readable label for every reason. A raw identifier next
    to a researcher's paper is not one."""
    assert codec.not_checked_from_row(("Links", "no_latex_source", "", "b")) == NotChecked(
        what="Links", reason=ReasonCode.NO_LATEX_SOURCE, detail="", siglum="b"
    )
    assert codec.not_checked_from_row(("Links", "invented_code", "", "")) is None


def test_jsonb_is_read_from_a_dict_or_a_string():
    anchor = _anchor().model_dump(mode="json")
    assert codec._as_dict(anchor) == anchor
    assert codec._as_dict(json.dumps(anchor)) == anchor


def test_naive_timestamps_are_read_as_utc():
    naive = datetime(2026, 8, 1, 12, 0)
    assert codec.utc(naive).tzinfo is timezone.utc
    assert codec.utc(None) is None


def test_amendment_round_trip():
    amendment = Amendment(
        finding_fingerprint="f" * 64,
        claim_id="c" * 64,
        submitted_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        author_statement="The body text is a typo; the table is correct.",
        corrected_value="41.8",
        status="open",
        resolution_note="",
    )
    params = codec.amendment_params(amendment, "g" * 64)
    row = (
        params["finding_fingerprint"],
        params["claim_id"],
        params["submitted_at"],
        params["author_statement"],
        params["corrected_value"],
        params["status"],
        params["recheck_result_fingerprint"],
        params["resolution_note"],
    )
    assert codec.amendment_from_row(row) == amendment


# --------------------------------------------------------------------------
# The interface, and the env var that selects it
# --------------------------------------------------------------------------


def _public(obj) -> set[str]:
    return {
        name
        for name, _ in inspect.getmembers(obj, callable)
        if not name.startswith("_")
    }


def test_the_postgres_run_store_has_the_interface_the_memory_one_defines():
    from pv.store.pg import PgRunStore

    assert _public(RunStore) <= _public(PgRunStore)


def test_the_postgres_record_has_the_record_surface():
    from pv.store.pg import PgRunRecord

    assert _public(RunRecord) <= _public(PgRunRecord)
    # And the read side is inherited rather than reimplemented: one `report()`,
    # one `summary()`, so they cannot drift from `models.py` separately.
    assert issubclass(PgRunRecord, RunRecord)


def test_the_postgres_amendment_store_has_the_amendment_interface():
    from pv.store.pg import PgAmendmentStore

    assert _public(AmendmentStore) <= _public(PgAmendmentStore)


def test_the_postgres_review_queue_has_the_gate_interface():
    from pv.store.gate import PgReviewQueue

    assert _public(ReviewQueue) <= _public(PgReviewQueue)
    assert issubclass(PgReviewQueue, ReviewQueue)


def test_the_backend_defaults_to_memory_without_a_database_url():
    settings = config.StoreSettings.from_env({})
    assert settings.backend == config.MEMORY
    assert not settings.is_postgres


def test_a_database_url_selects_postgres():
    settings = config.StoreSettings.from_env({"DATABASE_URL": "postgresql://x/y"})
    assert settings.is_postgres


def test_memory_can_be_forced_with_a_database_url_present():
    settings = config.StoreSettings.from_env(
        {"DATABASE_URL": "postgresql://x/y", "PV_STORE_BACKEND": "memory"}
    )
    assert settings.backend == config.MEMORY


def test_postgres_without_a_url_is_a_configuration_error():
    with pytest.raises(ValueError, match="DATABASE_URL"):
        config.StoreSettings.from_env({"PV_STORE_BACKEND": "postgres"})


def test_an_unknown_backend_is_rejected():
    with pytest.raises(ValueError, match="PV_STORE_BACKEND"):
        config.StoreSettings.from_env({"PV_STORE_BACKEND": "sqlite"})


def test_the_factories_return_the_in_memory_stores_today(monkeypatch):
    """With no `DATABASE_URL` the process behaves exactly as it does now. Setting
    the variable is the entire switch."""
    import pv.store as store_pkg

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PV_STORE_BACKEND", raising=False)
    store_pkg.reset()
    try:
        assert isinstance(store_pkg.get_run_store(), RunStore)
        assert isinstance(store_pkg.get_amendment_store(), AmendmentStore)
        assert isinstance(store_pkg.get_review_queue(), ReviewQueue)
        assert store_pkg.get_event_bus(None) is None
    finally:
        store_pkg.reset()


def test_importing_the_store_needs_no_driver():
    """The suite runs with no `psycopg` installed and must keep doing so: the
    driver is imported inside functions, never at module scope."""
    import pv.store.db as db_module
    import pv.store.pg as pg_module

    for module in (db_module, pg_module, sql, codec, migrate):
        source = inspect.getsource(module)
        for line in source.splitlines():
            assert not line.startswith("import psycopg"), module.__name__
            assert not line.startswith("from psycopg"), module.__name__


# --------------------------------------------------------------------------
# The event bus
# --------------------------------------------------------------------------


def test_a_channel_name_fits_in_a_postgres_identifier():
    """A silently truncated channel name would deliver one run's events to
    another run's subscribers."""
    run_id = "a" * 32  # uuid4().hex
    assert len(channel_for(run_id)) < 63
    assert run_id_for(channel_for(run_id)) == run_id


def test_a_malformed_payload_never_raises():
    """A listener is what every open stream in the process depends on. A bad
    payload is a reason to re-read the run, not a reason to take it down."""
    assert parse_payload("not json") == {}
    assert parse_payload("[1, 2]") == {}
    assert parse_payload('{"kind": "check", "idx": 3}') == {"kind": "check", "idx": 3}


def test_the_notify_payload_carries_an_identifier_and_not_the_event():
    """NOTIFY has an 8000-byte limit a `CheckResult` would exceed, and a payload
    the listener trusted could disagree with the table."""
    notify = MIGRATIONS[2].sql
    assert "json_build_object('kind', 'check', 'run_id', NEW.run_id, 'idx', NEW.idx)" in notify
    assert "verdict" not in notify.split("pv_notify_check")[1].split("$$")[1]


def test_a_check_insert_notifies_its_run():
    notify = MIGRATIONS[2].sql
    assert "'run_' || NEW.run_id" in notify
    assert re.search(r"CREATE TRIGGER checks_notify\s+AFTER INSERT ON checks", notify)


def test_a_run_notifies_only_on_a_transition_that_matters():
    """A driver polls `awaiting_artifact`; one event per poll is a stream that
    says the same thing three hundred times while nothing happens."""
    notify = MIGRATIONS[2].sql
    assert "NEW.stage IS DISTINCT FROM OLD.stage" in notify
    assert "OLD.status IS DISTINCT FROM 'complete'" in notify


# --------------------------------------------------------------------------
# Live database. Skipped until DATABASE_URL exists.
#
# These apply the migrations to the database DATABASE_URL points at. Point it at
# a branch database (§15.4), never at production.
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def live_db():
    migrate.apply(DATABASE_URL)
    from pv.store.db import Database

    database = Database(config.StoreSettings.from_env())
    yield database
    database.close()


@needs_db
def test_migrations_apply_and_are_idempotent(live_db):
    assert migrate.apply(DATABASE_URL) == []


@needs_db
def test_a_run_round_trips_through_postgres(live_db):
    from pv.api.schemas import CheckDescriptor
    from pv.models import RunReport
    from pv.store.pg import PgRunStore

    store = PgRunStore(live_db)
    record = store.create(
        "1706.03762",
        [CheckDescriptor(checker="bold_is_max", checker_version="3")],
        version="v5",
    )
    record.start(title="Attention is all you need")
    record.append_check(_result())
    record.finish(
        RunReport(
            arxiv_id="1706.03762",
            title="Attention is all you need",
            tables_parsed=3,
            not_checked=[
                NotChecked(what="Links", reason=ReasonCode.NO_APPLICABLE_CLAIMS)
            ],
        )
    )

    fresh = PgRunStore(live_db)
    reloaded = fresh.get(record.run_id)
    assert reloaded is not None
    assert reloaded.report().checks == [_result()]
    assert [n.reason for n in reloaded.not_checked] == [ReasonCode.NO_APPLICABLE_CLAIMS]
    assert reloaded.summary().findings == 1


@needs_db
def test_a_check_row_cannot_be_updated(live_db):
    """Append-only at the database, not by agreement."""
    import psycopg

    with pytest.raises(psycopg.errors.RestrictViolation):
        live_db.execute(("UPDATE checks SET verdict = 'matches'", ()))


@needs_db
def test_an_unreviewed_high_severity_divergence_is_held(live_db):
    """The property the whole gate exists for, asserted against real rows."""
    from pv.amendments.identity import finding_fingerprint
    from pv.models import RunReport
    from pv.store.gate import PgReviewQueue

    result = _result()
    report = RunReport(arxiv_id="1706.03762", checks=[result])
    queue = PgReviewQueue(live_db)
    fingerprint = finding_fingerprint(result, result.findings[0])
    assert queue.state_of("no-such-run", fingerprint) is ReviewState.HELD
    assert not queue.is_public("no-such-run", fingerprint)
    assert queue.held_count("no-such-run", report) == 1
