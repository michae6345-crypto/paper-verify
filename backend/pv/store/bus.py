"""The shared event bus: Postgres LISTEN/NOTIFY (§15.1).

`render.yaml` pins `--workers 1` because SSE fan-out is in-process. A second
worker answers `GET /runs/{id}` for runs it has never seen, and a browser
attached to worker B never hears an event published by worker A. Scaling out
needs a shared store *and* a shared event bus. `pg.py` is the first; this is the
second.

    The store writes a check row. A trigger issues NOTIFY run_<id>. Each web
    process holds one listener connection, reads the row, and fans out to its
    own SSE subscribers.

No Redis. The database we already have is the message broker, the notification
is transactional with the write that caused it, and there is no second service
to run out of memory at 3am.

**The payload is an identifier, never the event.** NOTIFY has an 8000-byte
payload limit that a `CheckResult` with several findings would exceed, and — the
real reason — a listener that trusted a payload could serve a client a different
object from the one the table holds. So the notification says a row landed and
the listener reads it back. A missed notification is self-correcting: the next
one reads forward from wherever this copy got to.

**One listener connection per process.** Supabase's free tier counts connections
in dozens, and this one sits outside the pool in `db.py` because it is idle
almost all the time and must never wait behind a query for one.
"""

from __future__ import annotations

import asyncio
import json
import logging

log = logging.getLogger(__name__)

# How long the notification generator runs before handing control back so newly
# watched runs can be added to the LISTEN set. It is not a poll interval for
# events — a notification arriving mid-window is delivered immediately. It only
# bounds how long a brand-new SSE subscriber waits to be subscribed at the
# database, which is why a second is generous rather than sluggish.
CHANNEL_SYNC_SECONDS = 1.0

# Reconnect backoff. A listener that cannot connect must keep trying quietly: the
# API still serves reports from the tables while it is down, so this is degraded
# streaming, not an outage, and it must not be logged as one on every retry.
RECONNECT_MIN_SECONDS = 1.0
RECONNECT_MAX_SECONDS = 30.0


def channel_for(run_id: str) -> str:
    """`run_<id>`. A uuid4 hex is 32 characters, so this is 36 — comfortably
    inside Postgres's 63-byte identifier limit, which is worth stating because a
    silently truncated channel name would deliver one run's events to another."""
    return f"run_{run_id}"


def run_id_for(channel: str) -> str:
    return channel[4:] if channel.startswith("run_") else channel


def parse_payload(payload: str) -> dict:
    """The notification body, or an empty dict.

    Never raises. A malformed payload is a reason to re-read the run, not a
    reason to take down the listener that every open stream in this process
    depends on.
    """
    try:
        data = json.loads(payload)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


class RunEventBus:
    """Listens for one process and fans out to the records it holds.

    `watch` is called when an SSE subscriber attaches, `unwatch` when the last
    one detaches, so a process listens to the runs someone is actually reading
    rather than to every run in the corpus.
    """

    def __init__(self, dsn: str, store, *, sync_seconds: float = CHANNEL_SYNC_SECONDS) -> None:
        self.dsn = dsn
        self.store = store
        self.sync_seconds = sync_seconds
        self._wanted: set[str] = set()
        self._listening: set[str] = set()
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    # -- lifecycle --------------------------------------------------------

    def start(self) -> None:
        if self._task is None:
            self._stop = asyncio.Event()
            self._task = asyncio.create_task(self._run(), name="pv-listen")

    async def stop(self) -> None:
        self._stop.set()
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001 - shutdown
                pass

    def watch(self, run_id: str) -> None:
        self._wanted.add(run_id)

    def unwatch(self, run_id: str) -> None:
        self._wanted.discard(run_id)

    # -- the loop ---------------------------------------------------------

    async def _run(self) -> None:
        delay = RECONNECT_MIN_SECONDS
        while not self._stop.is_set():
            try:
                await self._listen_forever()
                delay = RECONNECT_MIN_SECONDS
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - a listener must not die
                log.warning("listener disconnected (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, RECONNECT_MAX_SECONDS)

    async def _listen_forever(self) -> None:
        from psycopg import AsyncConnection

        self._listening = set()
        async with await AsyncConnection.connect(self.dsn, autocommit=True) as conn:
            while not self._stop.is_set():
                await self._sync_channels(conn)
                # `timeout` returns control so newly watched runs can be added.
                # Notifications arriving inside the window are yielded as they
                # arrive; this is not polling.
                async for note in conn.notifies(timeout=self.sync_seconds):
                    await self._dispatch(note.channel, note.payload)
                    if self._stop.is_set():
                        return

    async def _sync_channels(self, conn) -> None:
        for run_id in sorted(self._wanted - self._listening):
            await conn.execute(f'LISTEN "{channel_for(run_id)}"')
            self._listening.add(run_id)
        for run_id in sorted(self._listening - self._wanted):
            await conn.execute(f'UNLISTEN "{channel_for(run_id)}"')
            self._listening.discard(run_id)

    # -- delivery ---------------------------------------------------------

    async def _dispatch(self, channel: str, payload: str) -> None:
        """Deliver one notification to this process's copy of the run.

        Only to a record this process already holds. Hydrating a run because
        another worker wrote to it would have every process holding every run,
        which is the opposite of what splitting them apart is for.

        The reads run in a worker thread: they are synchronous (`db.py` explains
        why) and this is the event loop that every SSE stream in the process is
        served from.
        """
        run_id = run_id_for(channel)
        record = getattr(self.store, "_local", {}).get(run_id)
        if record is None:
            return
        kind = parse_payload(payload).get("kind")

        if kind == "check":
            await asyncio.to_thread(record.refresh_checks)
        elif kind in {"state", "done"}:
            from . import sql

            row = await asyncio.to_thread(
                record._db.fetchone, sql.select_run(run_id)
            )
            if row is not None:
                record.apply_run_row(row)
        else:
            # An unrecognised kind is a newer writer talking to an older reader.
            # Re-reading the tail is always correct and never wrong-headed, so
            # that is what an unknown event means here.
            await asyncio.to_thread(record.refresh_checks)


__all__ = [
    "CHANNEL_SYNC_SECONDS",
    "RunEventBus",
    "channel_for",
    "parse_payload",
    "run_id_for",
]
