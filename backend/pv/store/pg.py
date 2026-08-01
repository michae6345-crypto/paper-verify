"""The Postgres store: §14.9 step 5.

Same three methods `pv.api.store.RunStore` already has — `create`, `get`,
`recent` — and the same record surface behind them, so nothing upstream changes
shape. That is the whole requirement, and it is why `PgRunRecord` subclasses
`RunRecord` rather than reimplementing it: the read side (`report`, `envelope`,
`summary`) and the local SSE fan-out are already correct and shared, and a second
copy of them would be a second thing to keep in step with `models.py`.

What the subclass adds is a write-through. Every method that changes the record
writes the row first and then updates the in-memory copy, so a process that dies
between the two loses nothing a reader would have seen.

**Two processes, one run.** This is the point of the exercise (§15.1). The
process holding the run drives it; every other process hydrates a read-only copy
from the tables on demand and receives events through `bus.py`. A record that was
hydrated rather than created does not write — `apply_check` and `apply_run_row`
are the paths the listener uses, and they publish to local subscribers without
touching the database. If both a driver and a listener wrote, a check would be
appended twice and the SSE replay would show every result in duplicate.

**What is still process-local, honestly.** The `queued -> running` transition and
the `awaiting_artifact` pause are driven by the process that owns the run. A
second process learns about them through NOTIFY, which is the same latency as the
SSE stream itself. Nothing here makes two processes able to *drive* one run; it
makes them able to serve and stream one.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict
from datetime import datetime, timezone

from ..amendments.identity import amendment_fingerprint, finding_fingerprint
from ..models import Amendment, Artifact, CheckResult, NotChecked, RunReport
from ..orchestrator import RunStage
from ..api.schemas import Run, RunManifest, RunStatus
from ..api.store import RunRecord, _status_for
from . import codec, sql
from .db import Database


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PgRunRecord(RunRecord):
    """One run, backed by rows.

    `_authoritative` is False on a record this process hydrated for reading. It
    is not a permission check — it is the answer to "who appends the row", and
    there has to be exactly one.
    """

    def __init__(
        self,
        db: Database,
        run_id: str,
        arxiv_id: str,
        manifest: RunManifest,
        *,
        authoritative: bool = True,
    ) -> None:
        super().__init__(run_id=run_id, arxiv_id=arxiv_id, manifest=manifest)
        self._db = db
        self._authoritative = authoritative

    # -- writes -----------------------------------------------------------

    def _persist_state(self) -> None:
        self._db.execute(
            sql.update_run_state(
                self.run_id,
                status=self.status.value,
                stage=self.stage.value,
                title=self.title,
                tables_parsed=self.tables_parsed,
                started_at=self.started_at,
                finished_at=self.finished_at,
                artifact=self.artifact.model_dump(mode="json") if self.artifact else None,
                artifact_candidates=[
                    a.model_dump(mode="json") for a in self.artifact_candidates
                ],
                artifact_deadline=self.artifact_deadline,
            )
        )

    def start(self, title: str = "") -> None:
        super().start(title=title)
        if self._authoritative:
            self._persist_state()

    def await_artifact(
        self, candidates: list[Artifact], deadline: datetime | None = None
    ) -> None:
        was_waiting = self.stage is RunStage.AWAITING_ARTIFACT
        super().await_artifact(candidates, deadline)
        # Published only on entry, in the base class. Persisting on every call
        # would write the same row three hundred times while a driver polls a
        # pause that has not moved.
        if self._authoritative and not was_waiting:
            self._persist_state()

    def confirm_artifact(self, artifact: Artifact | None) -> None:
        super().confirm_artifact(artifact)
        if self._authoritative:
            self._persist_state()

    def append_check(self, result: CheckResult) -> None:
        """Append one terminal result: the row, its findings, then the event.

        The row first. An SSE subscriber that saw a check the database does not
        hold would be reading a verdict that will not survive a restart, and a
        reader who then shared the permalink would find it gone.

        The database assigns `idx`, so the position in the stream is the position
        in the table even if two writers race. The local list is appended after,
        under the same index, which is what keeps a replay identical to the live
        stream.
        """
        if not self._authoritative:
            # A hydrated copy learns about checks through the bus. Writing here
            # would append the row a second time.
            self.apply_check(result)
            return

        with self._db.transaction() as conn:
            statement, params = sql.insert_check(
                self.run_id, **codec.check_params(result)
            )
            check_id, idx = conn.execute(statement, params).fetchone()
            for ordinal, finding in enumerate(result.findings):
                fstatement, fparams = sql.insert_finding(
                    check_id,
                    **codec.finding_params(
                        finding, ordinal, finding_fingerprint(result, finding)
                    ),
                )
                conn.execute(fstatement, fparams)

        # The event carries the position the database assigned, not the length of
        # the local list. They agree while this process is the only writer for
        # this run, and when they ever disagree the table is the record — a
        # subscriber must not be told a check is result 4 of a run in which it is
        # stored as result 5.
        from ..api.schemas import CheckEvent, StreamEvent

        self.checks.append(result)
        self._publish(
            (StreamEvent.CHECK, CheckEvent(run_id=self.run_id, index=idx, result=result))
        )

    def finish(
        self,
        report: RunReport,
        *,
        stage: RunStage = RunStage.COMPLETE,
        artifact: Artifact | None = None,
    ) -> None:
        """Close the run: the §5.5 list, the run row, then the terminal event.

        `not_checked` is written here rather than as it accumulates because it is
        produced by the aggregation stage in one pass. Each row carries its
        position, and the insert is a no-op on conflict, so replaying aggregation
        after a restart does not double every entry in the report.
        """
        if self._authoritative:
            for ordinal, entry in enumerate(report.not_checked):
                self._db.execute(
                    sql.insert_not_checked(
                        self.run_id, **codec.not_checked_params(entry, ordinal)
                    )
                )
        # Base class sets the terminal fields and closes every stream. The run
        # row is written before that, so a client that reconnects on the strength
        # of the `done` event finds a complete run rather than a running one.
        self.title = report.title or self.title
        self.tables_parsed = report.tables_parsed
        self.not_checked = list(report.not_checked)
        self.started_at = report.started_at or self.started_at
        self.finished_at = report.finished_at or _now()
        self.stage = stage
        self.artifact = artifact or self.artifact
        self.artifact_candidates = []
        self.status = _status_for(stage)
        if self._authoritative:
            self._persist_state()
        super().finish(report, stage=stage, artifact=artifact)

    # -- the bus (§15.1) --------------------------------------------------

    def apply_check(self, result: CheckResult) -> None:
        """A check another process appended. Fan out locally, write nothing."""
        index = len(self.checks)
        self.checks.append(result)
        from ..api.schemas import CheckEvent, StreamEvent

        self._publish(
            (StreamEvent.CHECK, CheckEvent(run_id=self.run_id, index=index, result=result))
        )

    def apply_run_row(self, row: tuple) -> None:
        """Run-level state another process wrote.

        On a terminal status this emits `done` and closes every local stream,
        which is what lets a browser attached to worker B see a run driven by
        worker A end rather than hang until its timeout.
        """
        data = codec.run_row(row)
        self.title = data["title"] or self.title
        self.tables_parsed = data["tables_parsed"] or self.tables_parsed
        self.started_at = codec.utc(data["started_at"])
        self.finished_at = codec.utc(data["finished_at"])
        self.stage = RunStage(data["stage"])
        self.status = RunStatus(data["status"])
        self.artifact = Artifact.model_validate(data["artifact"]) if data["artifact"] else None
        self.artifact_candidates = [
            Artifact.model_validate(a) for a in data["artifact_candidates"]
        ]
        self.artifact_deadline = codec.utc(data["artifact_deadline"])

        from ..api.schemas import DoneEvent, StateEvent, StreamEvent

        if self.status is RunStatus.COMPLETE:
            self._publish((StreamEvent.DONE, DoneEvent(run_id=self.run_id, run=self.envelope())))
            self._close()
        elif self.stage is RunStage.AWAITING_ARTIFACT:
            self._publish(
                (
                    StreamEvent.STATE,
                    StateEvent(
                        run_id=self.run_id,
                        state=self.stage,
                        artifact_candidates=list(self.artifact_candidates),
                        deadline=self.artifact_deadline,
                    ),
                )
            )

    def refresh_checks(self) -> None:
        """Read forward from what this copy already has.

        The notification says a row landed; it does not carry the row (NOTIFY has
        an 8000-byte payload limit that a check with several findings would
        exceed, and a payload the listener trusted could disagree with the
        table). So the listener reads the tail, and a copy that missed a
        notification catches up on the next one rather than staying behind
        forever.
        """
        since = len(self.checks) - 1 if self.checks else None
        rows = self._db.fetchall(sql.select_checks(self.run_id, since_idx=since))
        if not rows:
            return
        findings = codec.findings_by_check(
            self._db.fetchall(sql.select_findings(self.run_id))
        )
        for row in rows:
            data = codec.check_row(row)
            self.apply_check(codec.check_from_row(row, findings.get(data["idx"], [])))


class PgRunStore:
    """Runs in Postgres, behind the interface `pv.api.store.RunStore` satisfies.

    `_local` is a cache of records this process is driving or streaming, not the
    store. `get` falls back to the tables, so a `GET /runs/{id}` served by a
    process that has never seen the run answers with the run rather than a 404 —
    the exact failure that pins `--workers 1` today.
    """

    def __init__(self, db: Database, max_runs: int = 200) -> None:
        self.db = db
        self.max_runs = max_runs
        self._local: "OrderedDict[str, PgRunRecord]" = OrderedDict()

    # -- writes -----------------------------------------------------------

    def create(self, arxiv_id: str, manifest_checks, version: str | None = None) -> PgRunRecord:
        run_id = uuid.uuid4().hex
        manifest = RunManifest(
            run_id=run_id, arxiv_id=arxiv_id, version=version, checks=list(manifest_checks)
        )
        self.db.execute(
            sql.insert_run(
                run_id,
                arxiv_id,
                version=version,
                manifest=manifest.model_dump(mode="json"),
            )
        )
        record = PgRunRecord(self.db, run_id, arxiv_id, manifest, authoritative=True)
        self._remember(record)
        return record

    # -- reads ------------------------------------------------------------

    def get(self, run_id: str) -> PgRunRecord | None:
        cached = self._local.get(run_id)
        if cached is not None:
            self._local.move_to_end(run_id)
            return cached
        row = self.db.fetchone(sql.select_run(run_id))
        if row is None:
            return None
        record = self._hydrate(row)
        self._remember(record)
        return record

    def recent(self, limit: int = 20) -> list[PgRunRecord]:
        """Most recent first, from the table rather than from this process.

        Deliberately hydrated in full: `RunSummary` counts verdicts and findings,
        and a summary that guessed at those to save a query would put a number on
        the run list that the report disagrees with.
        """
        rows = self.db.fetchall(sql.select_recent_runs(limit))
        out: list[PgRunRecord] = []
        for row in rows:
            run_id = row[0]
            cached = self._local.get(run_id)
            out.append(cached if cached is not None else self._hydrate(row))
        return out

    # -- internals --------------------------------------------------------

    def _remember(self, record: PgRunRecord) -> None:
        self._local[record.run_id] = record
        self._local.move_to_end(record.run_id)
        while len(self._local) > self.max_runs:
            # Evicting a record with live subscribers would strand them, so the
            # cache only drops runs nobody is streaming.
            for key, candidate in list(self._local.items()):
                if not candidate._subscribers:
                    del self._local[key]
                    break
            else:
                break

    def _hydrate(self, row: tuple) -> PgRunRecord:
        data = codec.run_row(row)
        manifest = RunManifest.model_validate(data["manifest"]) if data["manifest"] else (
            RunManifest(run_id=data["run_id"], arxiv_id=data["arxiv_id"])
        )
        record = PgRunRecord(
            self.db,
            data["run_id"],
            data["arxiv_id"],
            manifest,
            # Read-only: some other process is driving this run, or none is and
            # the run is over. Either way this copy must not append.
            authoritative=False,
        )
        record.title = data["title"] or ""
        record.status = RunStatus(data["status"])
        record.stage = RunStage(data["stage"])
        record.tables_parsed = data["tables_parsed"] or 0
        record.started_at = codec.utc(data["started_at"])
        record.finished_at = codec.utc(data["finished_at"])
        record.artifact_deadline = codec.utc(data["artifact_deadline"])
        record.artifact = (
            Artifact.model_validate(data["artifact"]) if data["artifact"] else None
        )
        record.artifact_candidates = [
            Artifact.model_validate(a) for a in data["artifact_candidates"]
        ]

        run_id = data["run_id"]
        findings = codec.findings_by_check(self.db.fetchall(sql.select_findings(run_id)))
        for check_row in self.db.fetchall(sql.select_checks(run_id)):
            idx = codec.check_row(check_row)["idx"]
            record.checks.append(codec.check_from_row(check_row, findings.get(idx, [])))

        not_checked: list[NotChecked] = []
        for nc_row in self.db.fetchall(sql.select_not_checked(run_id)):
            entry = codec.not_checked_from_row(nc_row)
            if entry is not None:
                not_checked.append(entry)
        record.not_checked = not_checked
        return record

    def envelope(self, run_id: str) -> Run | None:  # pragma: no cover - convenience
        record = self.get(run_id)
        return None if record is None else record.envelope()


class PgAmendmentStore:
    """The amendment log, behind the interface `pv.amendments.AmendmentStore`
    satisfies: `append`, `supersede`, `history`, `for_finding`, `current`,
    `latest`.

    Append-only at the database, not by agreement: `amendments` carries a trigger
    that raises on UPDATE and DELETE. An amendment is someone else's words about
    us, and an operator who could edit an author's objection after the fact is
    the one arrangement this flow must make impossible.
    """

    def __init__(self, db: Database) -> None:
        self.db = db

    def append(self, run_id: str, amendment: Amendment) -> Amendment:
        """`submitted_at` is stamped by the database when the caller left it
        unset, so the timestamp is when we received the statement rather than
        whatever a client claimed."""
        row = self.db.fetchone(
            sql.insert_amendment(
                run_id,
                **codec.amendment_params(amendment, amendment_fingerprint(amendment)),
            )
        )
        _seq, submitted_at = row
        return amendment.model_copy(update={"submitted_at": codec.utc(submitted_at)})

    def supersede(self, run_id: str, previous: Amendment, **changes) -> Amendment:
        """A new row carrying `previous` forward with `changes` applied.

        The author's statement is copied verbatim: it is the thing being carried
        forward, and a resolution that dropped it would leave the record showing
        our answer without their question.
        """
        return self.append(
            run_id, previous.model_copy(update={**changes, "submitted_at": None})
        )

    def history(self, run_id: str) -> list[Amendment]:
        return [
            codec.amendment_from_row(row)
            for row in self.db.fetchall(sql.select_amendments(run_id))
        ]

    def for_finding(self, run_id: str, fingerprint: str) -> list[Amendment]:
        return [
            codec.amendment_from_row(row)
            for row in self.db.fetchall(
                sql.select_amendments_for_finding(run_id, fingerprint)
            )
        ]

    def current(self, run_id: str) -> dict[str, Amendment]:
        """The standing amendment per fingerprint — the last row for each.

        Earlier rows are not superseded in storage, only in this view, which is
        the distinction the whole module rests on.
        """
        out: dict[str, Amendment] = {}
        for amendment in self.history(run_id):
            out[amendment.finding_fingerprint] = amendment
        return out

    def latest(self, run_id: str, fingerprint: str) -> Amendment | None:
        rows = self.for_finding(run_id, fingerprint)
        return rows[-1] if rows else None


__all__ = ["PgAmendmentStore", "PgRunRecord", "PgRunStore"]
