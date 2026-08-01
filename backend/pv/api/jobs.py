"""Running a paper, one stage at a time, so the stream has something to say.

`pv.run.run_paper` is atomic: id in, finished `RunReport` out. That is right for
the CLI and wrong for a stream, which needs to emit each check as it lands. So
this module walks the same stages in the same order — ingest, parse, then each
discovered check through `registry.run_check` — and shares `run.collect_not_checked`
so the run-level "not checked" list is assembled by exactly one implementation.
Nothing here decides a verdict; it only decides when to publish one.

Two rules from CLAUDE.md shape the code below:

**A run never fails as a whole.** A check that raises is already converted to
`unverifiable / checker_error` by `registry.run_check`; a paper with no LaTeX
source yields a valid report whose `not_checked` says so. There is no 500 for a
paper we could not check — that is a report, not an error.

**Parsing LaTeX is CPU-bound.** Eight seconds inside `parse_document` on the
event loop is eight seconds of every SSE client hearing nothing, which looks
broken. Every synchronous stage runs in a worker thread.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from ..ingest import ingest, ingest_directory
from ..ingest.fetch import normalize_arxiv_id
from ..models import (
    CheckContext,
    NotChecked,
    ReasonCode,
    RunReport,
    SourceDocument,
    Table,
)
from ..parse import parse_document
from ..run import DEFAULT_CHECKS, collect_not_checked
from ..checks import registry
from .config import Settings
from .schemas import CheckDescriptor
from .store import RunRecord


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

    Discovery is the same call the runner makes, so the manifest cannot drift
    from what actually executes: a check module that is absent is absent from
    both.
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


def _no_source_report(
    arxiv_id: str, reason: ReasonCode, detail: str, started: datetime, title: str = ""
) -> RunReport:
    """A paper we could not read. A valid report, not an error — §5.5 carries the
    reason and the UI shows it as "not checked"."""
    return RunReport(
        arxiv_id=arxiv_id,
        title=title,
        checks=[],
        not_checked=[
            NotChecked(what=f"Source for {arxiv_id}", reason=reason, detail=detail)
        ],
        started_at=started,
        finished_at=_now(),
    )


async def load_document(
    arxiv_id: str, settings: Settings
) -> tuple[SourceDocument | None, ReasonCode | None, str]:
    """Ingest, off the event loop. Returns (document, reason, detail); the reason
    is set only when there is nothing to check."""
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
) -> None:
    """Run one paper, publishing each check as it completes.

    Never raises: an unexpected failure anywhere becomes a finished report whose
    `not_checked` explains itself, because a half-open stream is worse than a
    thin report.
    """
    started = _now()
    record.start()
    arxiv_id = record.arxiv_id

    try:
        if id_error is not None:
            record.finish(
                _no_source_report(arxiv_id, ReasonCode.NO_LATEX_SOURCE, id_error, started)
            )
            return

        document, reason, detail = await load_document(arxiv_id, settings)
        if reason is not None:
            record.finish(
                _no_source_report(
                    arxiv_id, reason, detail, started, title=document.title if document else ""
                )
            )
            return
        assert document is not None
        record.start(title=document.title)

        tables: list[Table] = await asyncio.to_thread(parse_document, document)
        # A tabular nested in another table's cell is a line-break helper, not
        # data — same rule as the runner, and for the same reason.
        checkable = [t for t in tables if not t.is_nested]
        ctx = CheckContext(
            document=document, tables=checkable, llm_enabled=settings.llm_enabled
        )
        record.tables_parsed = len(checkable)

        results = []
        for module in registry.discover(checks):
            # `run_check` already converts a raising check into
            # unverifiable / checker_error. One check never takes down a run.
            result = await asyncio.to_thread(registry.run_check, module, ctx)
            results.append(result)
            record.append_check(result)

        record.finish(
            RunReport(
                arxiv_id=arxiv_id,
                title=document.title,
                checks=results,
                not_checked=collect_not_checked(document, tables, results),
                tables_parsed=len(checkable),
                started_at=started,
                finished_at=_now(),
            )
        )
    except Exception as exc:  # noqa: BLE001 — a run never fails as a whole.
        record.finish(
            _no_source_report(
                arxiv_id,
                ReasonCode.CHECKER_ERROR,
                f"This run could not be completed: {type(exc).__name__}.",
                started,
                title=record.title,
            )
        )


__all__ = ["execute", "load_document", "manifest_checks", "normalize_id"]
