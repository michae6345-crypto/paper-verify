"""API configuration. One place reads the environment; nothing else branches on it.

The local/hosted split (§13, CLAUDE.md) is expressed here as values, not as
`if LOCAL:` scattered through the routes:

    QUEUE_BACKEND      inline            FastAPI BackgroundTasks (the only backend today)
    PV_FIXTURES_DIR    unset             directory of paper sources; when set, a run whose
                                         id has a subdirectory there is ingested from disk
    PV_OFFLINE         0                 never touch the network during ingest; a paper we
                                         have no cached copy of comes back `network_error`
    PV_CORS_ORIGINS    localhost:3000    comma-separated
    PV_MAX_RUNS        200               how many runs the in-memory store keeps

Two variables the API does not read but which govern whether it makes requests:

    ARXIV_CACHE_DIR    <repo root>/.arxivcache
        Read by `pv.ingest.fetch` at call time. The default is anchored to the
        repository root, not to `cwd`, so serving from `backend/` uses the same
        cache the CLI filled rather than silently re-fetching into a second one.
        Set it only to point at a cache somewhere else.
    HTTP_BACKEND       live
        `offline` makes `pv.adapters.http` refuse every request, which is what
        keeps the link and citation checks off the wire.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CORS_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    queue_backend: str = "inline"
    fixtures_dir: Path | None = None
    offline: bool = False
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS
    max_runs: int = 200
    llm_enabled: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        fixtures = os.getenv("PV_FIXTURES_DIR", "").strip()
        origins = os.getenv("PV_CORS_ORIGINS", "").strip()
        try:
            max_runs = int(os.getenv("PV_MAX_RUNS", "200"))
        except ValueError:
            max_runs = 200
        return cls(
            queue_backend=os.getenv("QUEUE_BACKEND", "inline").strip().lower() or "inline",
            fixtures_dir=Path(fixtures) if fixtures else None,
            offline=_flag("PV_OFFLINE"),
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip())
            or DEFAULT_CORS_ORIGINS,
            max_runs=max_runs,
            llm_enabled=_flag("PV_LLM_ENABLED"),
        )

    def fixture_for(self, arxiv_id: str) -> str | None:
        """The on-disk source tree for this paper, if we have one.

        This is how the ten-paper validation corpus is served without a network
        round trip, and how the tests drive real runs.
        """
        if self.fixtures_dir is None:
            return None
        candidate = self.fixtures_dir / arxiv_id
        return str(candidate) if candidate.is_dir() else None


__all__ = ["Settings", "DEFAULT_CORS_ORIGINS"]
