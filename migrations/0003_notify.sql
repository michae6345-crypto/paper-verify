-- 0003_notify.sql — the shared event bus (§15.1).
--
-- `render.yaml` pins `--workers 1`, and correctly: SSE fan-out is in-process, so
-- a second worker answers `GET /runs/{id}` for runs it has never seen and its
-- subscribers never hear events published by worker A. Scaling out needs both a
-- shared store and a shared event bus. This is the bus: Postgres LISTEN/NOTIFY,
-- no Redis, no new service.
--
-- The notification is issued by a trigger rather than by the store, so that
-- *any* writer publishes — the API process, the worker process, and a backfill
-- run from a shell all produce the same events without three implementations of
-- the same NOTIFY.
--
-- The payload carries an identifier and nothing else. Two reasons: NOTIFY has an
-- 8000-byte payload limit that a `CheckResult` with several findings would
-- exceed, and a listener that reads the row back cannot serve a client a
-- different object from the one the store holds. The event says what changed;
-- the row says what it is.

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION pv_notify_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify(
        'run_' || NEW.run_id,
        json_build_object('kind', 'check', 'run_id', NEW.run_id, 'idx', NEW.idx)::text
    );
    RETURN NULL;
END;
$$;

CREATE TRIGGER checks_notify
    AFTER INSERT ON checks
    FOR EACH ROW EXECUTE FUNCTION pv_notify_check();


-- Run-level changes: the §14.2 stage, and the terminal event that closes every
-- stream. Fired on the transitions a subscriber has to react to, not on every
-- UPDATE — a run that enters `awaiting_artifact` publishes once, because the
-- driver polls that state and one event per poll is a stream that says the same
-- thing three hundred times while nothing happens.
CREATE OR REPLACE FUNCTION pv_notify_run() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    kind text;
BEGIN
    IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' THEN
        kind := 'done';
    ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
        kind := 'state';
    ELSE
        RETURN NULL;
    END IF;

    PERFORM pg_notify(
        'run_' || NEW.run_id,
        json_build_object('kind', kind, 'run_id', NEW.run_id, 'stage', NEW.stage)::text
    );
    RETURN NULL;
END;
$$;

CREATE TRIGGER runs_notify
    AFTER UPDATE ON runs
    FOR EACH ROW EXECUTE FUNCTION pv_notify_run();
