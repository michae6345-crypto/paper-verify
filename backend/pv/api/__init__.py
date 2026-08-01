"""HTTP surface over the checker.

    uvicorn pv.api.app:app --reload

`app.py` holds the routes, `schemas.py` the envelopes around `pv.models`,
`store.py` the append-only run log that stands in for Postgres until Docker
exists.

`jobs.py` is a *driver*, not a pipeline. The pipeline is `pv.orchestrator`, and
`pv.run` drives the same one synchronously for the CLI — so the API is a surface
over the runner rather than a second opinion about a paper.
"""

from .config import Settings

__all__ = ["Settings"]
