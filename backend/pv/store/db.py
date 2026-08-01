"""The connection pool, and the only place `psycopg` is imported for queries.

`psycopg` is imported inside functions rather than at module scope. The suite is
network-free and runs with no driver installed and no `DATABASE_URL`, and it has
to keep doing that: a top-level import here would make every test that touches
`pv.store` depend on a package whose absence is the normal state today.

Synchronous, deliberately. `RunStore.get` is called from a route body without an
await (`pv/api/app.py`), so the interface this replaces is synchronous and the
implementation has to be too — the alternative is changing every call site, which
is precisely what §13 says a second implementation must not require. The queries
are single-row primary-key reads against indexed columns. The listener in
`bus.py` is the one thing that must not block, and it holds its own async
connection outside this pool.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from .config import StoreSettings
from .sql import Statement


class Database:
    """A lazily-opened connection pool.

    Lazy because a store can be constructed at import time by a process that
    never issues a query — the migration job, a CLI run against a fixture — and a
    pool opened in that process is a connection taken from a free-tier budget
    measured in dozens.
    """

    def __init__(self, settings: StoreSettings) -> None:
        self.settings = settings
        self._pool: Any = None

    # -- lifecycle --------------------------------------------------------

    def pool(self) -> Any:
        if self._pool is None:
            from psycopg_pool import ConnectionPool

            self._pool = ConnectionPool(
                self.settings.database_url,
                min_size=self.settings.pool_min,
                max_size=self.settings.pool_max,
                kwargs={
                    "options": (
                        f"-c statement_timeout={self.settings.statement_timeout_ms}"
                    ),
                },
                open=True,
            )
        return self._pool

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close()
            self._pool = None

    @contextmanager
    def connection(self) -> Iterator[Any]:
        with self.pool().connection() as conn:
            yield conn

    # -- queries ----------------------------------------------------------

    def execute(self, statement: Statement) -> None:
        sql, params = statement
        with self.connection() as conn:
            conn.execute(sql, params)

    def fetchone(self, statement: Statement) -> tuple | None:
        sql, params = statement
        with self.connection() as conn:
            return conn.execute(sql, params).fetchone()

    def fetchall(self, statement: Statement) -> list[tuple]:
        sql, params = statement
        with self.connection() as conn:
            return conn.execute(sql, params).fetchall()

    @contextmanager
    def transaction(self) -> Iterator[Any]:
        """One connection, one transaction, for a write that is several
        statements. A check and its findings are written together or not at all:
        a check row with no findings behind it is a verdict with its evidence
        missing, which is the one shape this system must never produce."""
        with self.connection() as conn:
            with conn.transaction():
                yield conn


__all__ = ["Database"]
