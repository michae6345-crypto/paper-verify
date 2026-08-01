"""Which store is in use, decided in one place (§13).

    Every managed service has a local substitute selected by an env var, behind
    an interface with two implementations. Do not scatter `if LOCAL:` through the
    codebase.

So this module is the only thing in `pv.store` that reads the environment, and
the branch on backend happens exactly once, in `pv.store.get_run_store`.

    PV_STORE_BACKEND   memory | postgres
        Default: `postgres` when DATABASE_URL is set, `memory` otherwise. The
        default is inferred rather than fixed because there is no third state
        worth having — a DATABASE_URL nobody uses is a configuration mistake, and
        `postgres` with no URL cannot start.

    DATABASE_URL       postgresql://...
        Unset today. Everything here works without it; the Postgres path simply
        does not activate.

    PV_DB_POOL_MIN / PV_DB_POOL_MAX   1 / 8
        Connection pool bounds. Small on purpose: Supabase's free tier has a low
        connection ceiling, and each web process also holds one dedicated
        listener connection outside this pool (§15.1).

    PV_DB_STATEMENT_TIMEOUT_MS        5000
        A read on the request path that takes five seconds is a bug, not a slow
        query. Failing it is honest; hanging the event loop is not.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

MEMORY = "memory"
POSTGRES = "postgres"

DEFAULT_POOL_MIN = 1
DEFAULT_POOL_MAX = 8
DEFAULT_STATEMENT_TIMEOUT_MS = 5000


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class StoreSettings:
    backend: str = MEMORY
    database_url: str = ""
    pool_min: int = DEFAULT_POOL_MIN
    pool_max: int = DEFAULT_POOL_MAX
    statement_timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS

    @property
    def is_postgres(self) -> bool:
        return self.backend == POSTGRES

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "StoreSettings":
        source = os.environ if env is None else env
        url = (source.get("DATABASE_URL") or "").strip()
        backend = (source.get("PV_STORE_BACKEND") or "").strip().lower()
        if not backend:
            backend = POSTGRES if url else MEMORY
        if backend not in {MEMORY, POSTGRES}:
            raise ValueError(
                f"PV_STORE_BACKEND must be {MEMORY!r} or {POSTGRES!r}, not {backend!r}"
            )
        if backend == POSTGRES and not url:
            raise ValueError("PV_STORE_BACKEND=postgres needs DATABASE_URL")
        if env is None:
            return cls(
                backend=backend,
                database_url=url,
                pool_min=_int("PV_DB_POOL_MIN", DEFAULT_POOL_MIN),
                pool_max=_int("PV_DB_POOL_MAX", DEFAULT_POOL_MAX),
                statement_timeout_ms=_int(
                    "PV_DB_STATEMENT_TIMEOUT_MS", DEFAULT_STATEMENT_TIMEOUT_MS
                ),
            )
        return cls(backend=backend, database_url=url)


__all__ = ["MEMORY", "POSTGRES", "StoreSettings"]
