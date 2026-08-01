"""HTTP surface over the checker.

    uvicorn pv.api.app:app --reload

`app.py` holds the routes, `schemas.py` the envelopes around `pv.models`,
`jobs.py` the staged run that makes streaming possible, `store.py` the
append-only run log that stands in for Postgres until Docker exists.
"""

from .config import Settings

__all__ = ["Settings"]
