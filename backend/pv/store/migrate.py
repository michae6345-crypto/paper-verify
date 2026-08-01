"""Forward-only migrations, applied in order (§15.4).

Plain numbered SQL under `migrations/`, not Alembic and not an ORM's autogenerate.
The reason is the same reason `models.py` is the contract: there is one
declaration of every shape in this system, and a second one that a tool derives
and occasionally disagrees with is how a schema drifts away from the code that
reads it. These files are also the thing a reviewer reads to answer "what can the
public role see", and that answer must not require running a tool to obtain.

Forward-only means exactly that. There are no down migrations: a migration that
dropped a column would drop the evidence behind a published verdict, and this
system's whole claim is that the inputs to a finding can be reconstructed a year
later. A mistake in `0001` is corrected by `0002`.

Run as a **separate gated job before the app deploys**, never in the same step —
a migration that half-applies while the new image is already serving is how a
`GET /runs/{id}` starts returning 500s to people reading a report.

Everything above `apply()` is pure text handling and is unit-tested with no
database. `apply()` is the only function here that needs a connection.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

# `migrations/` sits at the repository root, beside `backend/` and `fixtures/`.
MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"

_NAME = re.compile(r"^(\d{4})_([a-z0-9_]+)\.sql$")

# Bootstrap. Created by the runner rather than by `0001`, so that the record of
# which migrations have run does not itself depend on a migration having run.
SCHEMA_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    name       text NOT NULL,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""


@dataclass(frozen=True)
class Migration:
    version: str  # "0001"
    name: str  # "core"
    path: Path
    sql: str

    @property
    def checksum(self) -> str:
        return sha256(self.sql.encode("utf-8")).hexdigest()

    def __str__(self) -> str:  # pragma: no cover - diagnostics
        return f"{self.version}_{self.name}.sql"


class MigrationError(RuntimeError):
    """The migration set on disk is not coherent, or does not match the database."""


def discover(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    """Every migration on disk, in order.

    Rejects a set that is not a contiguous run from 0001. A gap means a file was
    deleted or a branch was merged badly, and applying what is left produces a
    database nobody has ever tested against.
    """
    if not directory.is_dir():
        raise MigrationError(f"No migrations directory at {directory}")

    found: list[Migration] = []
    for path in sorted(directory.glob("*.sql")):
        match = _NAME.match(path.name)
        if match is None:
            raise MigrationError(
                f"{path.name} is not named NNNN_lower_snake_case.sql"
            )
        found.append(
            Migration(
                version=match.group(1),
                name=match.group(2),
                path=path,
                sql=path.read_text(encoding="utf-8"),
            )
        )

    expected = [f"{i:04d}" for i in range(1, len(found) + 1)]
    actual = [m.version for m in found]
    if actual != expected:
        raise MigrationError(
            f"Migrations must be a contiguous run from 0001; found {actual}"
        )
    return found


# --------------------------------------------------------------------------
# Static checks over the SQL text
#
# These exist because "RLS on every table, in the first migration" is a rule that
# is kept by remembering it, and rules kept by remembering are the ones that get
# forgotten in the migration written at speed six months from now. A table
# created without RLS is a public table the moment the Data API is enabled, and
# nothing about the code would look wrong. So it is a test instead.
# --------------------------------------------------------------------------

_CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)
_ENABLE_RLS = re.compile(
    r"ALTER\s+TABLE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
    re.IGNORECASE,
)
_CREATE_POLICY = re.compile(
    r"CREATE\s+POLICY\s+([a-z_][a-z0-9_]*)\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)


def _strip_comments(sql: str) -> str:
    """Line comments removed, so a table named in prose is not read as DDL."""
    return "\n".join(line.split("--", 1)[0] for line in sql.splitlines())


def tables_created(sql: str) -> list[str]:
    return _CREATE_TABLE.findall(_strip_comments(sql))


def tables_with_rls(sql: str) -> list[str]:
    return _ENABLE_RLS.findall(_strip_comments(sql))


def policies(sql: str) -> list[tuple[str, str]]:
    """(policy name, table) for every CREATE POLICY. Expected to be empty: the
    API reaches these tables as their owner, and every policy added here is a
    surface reachable by a key that ships in the browser."""
    return [(name, table) for name, table in _CREATE_POLICY.findall(_strip_comments(sql))]


# --------------------------------------------------------------------------
# Applying
# --------------------------------------------------------------------------


def pending(applied: dict[str, str], available: list[Migration]) -> list[Migration]:
    """What still has to run, and a check that what already ran has not changed.

    `applied` maps version -> checksum. A checksum mismatch is fatal rather than
    a warning: an edited migration means the database was built by SQL that no
    longer exists anywhere, so nothing downstream can be reproduced.
    """
    out: list[Migration] = []
    for migration in available:
        recorded = applied.get(migration.version)
        if recorded is None:
            out.append(migration)
        elif recorded != migration.checksum:
            raise MigrationError(
                f"{migration} has changed since it was applied. Migrations are "
                f"forward-only: add a new file rather than editing this one."
            )
    return out


def apply(
    database_url: str, directory: Path = MIGRATIONS_DIR, *, dry_run: bool = False
) -> list[str]:
    """Apply every pending migration. Returns the versions applied.

    Each migration runs in its own transaction, and its `schema_migrations` row
    is written inside that transaction: a migration is applied and recorded
    together or not at all.
    """
    import psycopg  # imported here: the test suite runs with no driver installed

    available = discover(directory)

    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(SCHEMA_TABLE_SQL)
        rows = conn.execute("SELECT version, checksum FROM schema_migrations").fetchall()
        applied = {version: checksum for version, checksum in rows}
        todo = pending(applied, available)
        if dry_run:
            return [m.version for m in todo]

        done: list[str] = []
        for migration in todo:
            with conn.transaction():
                conn.execute(migration.sql)
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, checksum) "
                    "VALUES (%s, %s, %s)",
                    (migration.version, migration.name, migration.checksum),
                )
            done.append(migration.version)
        return done


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - entry point
    import argparse
    import os

    parser = argparse.ArgumentParser(description="Apply pending migrations.")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--dir", type=Path, default=MIGRATIONS_DIR)
    parser.add_argument(
        "--dry-run", action="store_true", help="List what would run and exit."
    )
    args = parser.parse_args(argv)

    if not args.database_url:
        print("DATABASE_URL is not set. Nothing to migrate.")
        return 1

    done = apply(args.database_url, args.dir, dry_run=args.dry_run)
    verb = "would apply" if args.dry_run else "applied"
    print(f"{verb}: {', '.join(done) if done else 'nothing (up to date)'}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "MIGRATIONS_DIR",
    "Migration",
    "MigrationError",
    "SCHEMA_TABLE_SQL",
    "apply",
    "discover",
    "pending",
    "policies",
    "tables_created",
    "tables_with_rls",
]
