"""The run: arXiv id in, `RunReport` out. Build-order step 1 (brief §11).

The synchronous driver. Since §14.6 the pipeline itself lives in
`pv.orchestrator`; this is `start`, then `advance` to completion, then `report`.
The CLI is unchanged by that move, which is the point — one pipeline, two
drivers, and no way for the CLI and the API to reach different conclusions about
the same paper.

`collect_not_checked` moved to the orchestrator's aggregation stage, where it
belongs: it is the one thing no individual check can see. It is re-exported here
because that is where the rest of the codebase already imports it from.

Nothing in here calls a model.
"""

from __future__ import annotations

from pv.models import RunReport
from pv.orchestrator import (
    DEFAULT_CHECKS,
    Orchestrator,
    RunOptions,
    collect_not_checked,
)

__all__ = ["DEFAULT_CHECKS", "collect_not_checked", "run_paper"]


def run_paper(
    arxiv_id: str,
    *,
    from_directory: str | None = None,
    checks: tuple[str, ...] = DEFAULT_CHECKS,
    llm_enabled: bool = False,
    allow_network: bool = True,
) -> RunReport:
    """Fetch, parse, check, and assemble the report.

    `from_directory` runs against an on-disk fixture and never touches the network,
    which is how the ten-paper validation corpus is exercised.

    The run never pauses: `await_artifact` is off, so the §5.2 confirmation state
    is passed straight through. There is no human at a terminal to ask.
    """
    orchestrator = Orchestrator()
    run_id = orchestrator.start(
        arxiv_id,
        opts=RunOptions(
            checks=tuple(checks),
            from_directory=from_directory,
            allow_network=allow_network,
            llm_enabled=llm_enabled,
        ),
    )
    orchestrator.drive(run_id)
    return orchestrator.report(run_id)
