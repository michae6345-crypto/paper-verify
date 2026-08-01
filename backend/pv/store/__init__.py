"""Storage, with two implementations behind one interface (§13, §14.9 step 5).

    Every managed service has a local substitute selected by an env var, behind
    an interface with two implementations. Do not scatter `if LOCAL:` through the
    codebase.

The branch happens in the four factories below and nowhere else. `pv.api.app`
asks for a store; what it gets depends on `PV_STORE_BACKEND` and nothing about
the call site changes. The in-memory implementations are the ones that already
exist — `pv.api.store.RunStore`, `pv.amendments.AmendmentStore`,
`pv.review.ReviewQueue` — and are unchanged; the Postgres ones satisfy the same
methods.

    from pv.store import get_amendment_store, get_review_queue, get_run_store

    store = get_run_store()

**There is no live database yet.** With `DATABASE_URL` unset every factory
returns the in-memory implementation, which is exactly what the process does
today. Setting `DATABASE_URL` is the entire switch.

Wiring the API to these factories, starting the event bus in the lifespan, and
dropping `--workers 1` are three changes in files this module does not own. See
the report for what they are.
"""

from __future__ import annotations

from .config import MEMORY, POSTGRES, StoreSettings
from .db import Database

_db: Database | None = None
_settings: StoreSettings | None = None


def settings() -> StoreSettings:
    """Read once per process. A store that re-read the environment could hand two
    callers different backends, and half a run in each is worse than either."""
    global _settings
    if _settings is None:
        _settings = StoreSettings.from_env()
    return _settings


def database() -> Database:
    """The shared pool. Opens no connection until something queries."""
    global _db
    if _db is None:
        _db = Database(settings())
    return _db


def reset() -> None:
    """Drop the cached settings and pool. For tests, and for a process that
    changes its environment before serving anything."""
    global _db, _settings
    if _db is not None:
        _db.close()
    _db = None
    _settings = None


def get_run_store(max_runs: int = 200):
    """`create`, `get`, `recent` — the interface `pv.api.store.RunStore` defines."""
    if settings().is_postgres:
        from .pg import PgRunStore

        return PgRunStore(database(), max_runs=max_runs)
    from ..api.store import RunStore

    return RunStore(max_runs=max_runs)


def get_amendment_store():
    """The append-only amendment log."""
    if settings().is_postgres:
        from .pg import PgAmendmentStore

        return PgAmendmentStore(database())
    from ..amendments import AmendmentStore

    return AmendmentStore()


def get_review_queue(suppressions_dir=None):
    """§14.8's decisions. Held is the default in both implementations, and in
    neither of them is `held` a stored value: absence means held."""
    if settings().is_postgres:
        from .gate import PgReviewQueue

        return PgReviewQueue(database(), suppressions_dir=suppressions_dir)
    from ..review import ReviewQueue

    if suppressions_dir is None:
        return ReviewQueue()
    return ReviewQueue(suppressions_dir=suppressions_dir)


def get_event_bus(store):
    """The §15.1 fan-out, or None in memory mode.

    None is not a missing feature in memory mode: with one process and one
    in-process store, `RunRecord._publish` already reaches every subscriber there
    is. The bus exists to cross a process boundary that does not exist yet.
    """
    if not settings().is_postgres:
        return None
    from .bus import RunEventBus

    return RunEventBus(settings().database_url, store)


__all__ = [
    "MEMORY",
    "POSTGRES",
    "Database",
    "StoreSettings",
    "database",
    "get_amendment_store",
    "get_event_bus",
    "get_review_queue",
    "get_run_store",
    "reset",
    "settings",
]
