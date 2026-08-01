"""The async driver: the same pipeline, publishing after each step.

The stage walk used to live here as well as in `pv.run`, which is two
implementations of one pipeline and exactly how they drift apart. Since §14.6 it
lives in `pv.orchestrator`, and this module does one thing: `await` each
`advance`, then publish whatever landed. `pv.run` is the same loop without the
awaiting.

Two rules from CLAUDE.md shape the code below:

**A run never fails as a whole.** A check that raises is already converted to
`unverifiable / checker_error` by `registry.run_check`; a paper with no LaTeX
source terminates in `failed` with a valid report whose `not_checked` says so.
There is no 500 for a paper we could not check — that is a report, not an error.

**Parsing LaTeX is CPU-bound.** Eight seconds inside `parse_document` on the
event loop is eight seconds of every SSE client hearing nothing, which looks
broken. `advance` executes one stage, so every one of them goes to a worker
thread and the stream stays live between them.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from ..ingest.fetch import normalize_arxiv_id
from ..models import NotChecked, ReasonCode, RunReport, SourceDocument
from ..orchestrator import (
    DEFAULT_CHECKS,
    Orchestrator,
    RunOptions,
    RunStage,
    get_orchestrator,
)
from ..ingest import ingest, ingest_directory
from ..checks import registry
from .config import Settings
from .schemas import CheckDescriptor
from .store import RunRecord

# How long the driver sleeps between polls of a run waiting on a human. Short
# enough that a click feels immediate; the ten-minute ceiling is the
# orchestrator's, not this loop's.
_ARTIFACT_POLL_SECONDS = 0.2


def _now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_id(raw: str) -> tuple[str, str | None, str | None]:
    """(arxiv_id, version, error). Accepts a bare id, a versioned id, or an
    arXiv URL. A string that is not an arXiv id is not an exception here — the
    caller turns it into a report."""
    try:
        arxiv_id, version = normalize_arxiv_id(raw)
    except ValueError as exc:
        return raw.strip(), None, str(exc)
    return arxiv_id, version, None


def manifest_checks(names: tuple[str, ...] = DEFAULT_CHECKS) -> list[CheckDescriptor]:
    """The checks this run intends to execute, known before any of them runs.

    Discovery is the same call the orchestrator makes, so the manifest cannot
    drift from what actually executes: a check module that is absent appears in
    both, as the row that says it could not be loaded.
    """
    return [
        CheckDescriptor(
            checker=getattr(module, "CHECKER_NAME", module.__name__.rsplit(".", 1)[-1]),
            checker_version=getattr(module, "CHECKER_VERSION", "0"),
            display_name=getattr(module, "DISPLAY_NAME", ""),
            description=getattr(module, "DESCRIPTION", ""),
        )
        for module in registry.discover(names)
    ]


def run_options(
    arxiv_id: str,
    settings: Settings,
    *,
    checks: tuple[str, ...] = DEFAULT_CHECKS,
    id_error: str | None = None,
    await_artifact: bool = False,
) -> RunOptions:
    """Settings, translated into the orchestrator's vocabulary. One place reads
    the environment (`config.py`); the pipeline never branches on it."""
    return RunOptions(
        checks=checks,
        from_directory=settings.fixture_for(arxiv_id),
        allow_network=not settings.offline,
        llm_enabled=settings.llm_enabled,
        id_error=id_error,
        await_artifact=await_artifact,
        artifact_timeout_s=settings.artifact_timeout_s,
    )


async def load_document(
    arxiv_id: str, settings: Settings
) -> tuple[SourceDocument | None, ReasonCode | None, str]:
    """Ingest, off the event loop. Returns (document, reason, detail); the reason
    is set only when there is nothing to check.

    Used by the repositories endpoint, which needs a document without running a
    check pipeline over it.
    """
    fixture = settings.fixture_for(arxiv_id)

    def _ingest():
        if fixture is not None:
            return ingest_directory(fixture, arxiv_id=arxiv_id)
        return ingest(arxiv_id, allow_network=not settings.offline)

    result = await asyncio.to_thread(_ingest)
    document = result.document
    if not result.ok and not document.assembled_latex:
        return document, result.reason or ReasonCode.NO_LATEX_SOURCE, result.detail
    return document, None, ""


async def execute(
    record: RunRecord,
    settings: Settings,
    *,
    checks: tuple[str, ...] = DEFAULT_CHECKS,
    id_error: str | None = None,
    await_artifact: bool = False,
    orchestrator: Orchestrator | None = None,
) -> None:
    """Drive one run to a terminal stage, publishing each check as it lands.

    Never raises: an unexpected failure anywhere becomes a finished report whose
    `not_checked` explains itself, because a half-open stream is worse than a
    thin report.
    """
    orchestrator = orchestrator or get_orchestrator()
    record.start()

    try:
        run_id = orchestrator.start(
            record.arxiv_id,
            opts=run_options(
                record.arxiv_id,
                settings,
                checks=checks,
                id_error=id_error,
                await_artifact=await_artifact,
            ),
            run_id=record.run_id,
        )

        published = 0
        while True:
            state = await asyncio.to_thread(orchestrator.advance, run_id)

            if state.title:
                record.start(title=state.title)
            record.tables_parsed = state.tables_parsed

            # One event per check, the moment it lands rather than at the end.
            while published < len(state.results):
                record.append_check(state.results[published])
                published += 1

            if state.is_awaiting_artifact:
                record.await_artifact(state.artifact_candidates, state.artifact_deadline)
                remaining = state.seconds_until_artifact_deadline()
                await asyncio.sleep(min(_ARTIFACT_POLL_SECONDS, max(remaining, 0.0)))
                continue

            if state.is_terminal:
                break

        record.finish(orchestrator.report(run_id), stage=state.stage, artifact=state.artifact)
    except Exception as exc:  # noqa: BLE001 — a run never fails as a whole.
        record.finish(
            RunReport(
                arxiv_id=record.arxiv_id,
                title=record.title,
                checks=list(record.checks),
                not_checked=[
                    NotChecked(
                        what=f"Source for {record.arxiv_id}",
                        reason=ReasonCode.CHECKER_ERROR,
                        detail=f"This run could not be completed: {type(exc).__name__}.",
                    )
                ],
                started_at=record.started_at,
                finished_at=_now(),
            ),
            stage=RunStage.PARTIAL,
        )


__all__ = [
    "execute",
    "load_document",
    "manifest_checks",
    "normalize_id",
    "run_options",
]
