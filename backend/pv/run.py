"""The run: arXiv id in, `RunReport` out. Build-order step 1 (brief §11).

Orchestrator-owned. This is the seam where ingest, parse and the checks meet, and
it owns the one thing none of them can see alone: the run-level `not_checked` list.

An individual check reports a verdict about the claims it could evaluate. If one
table in a paper parsed and another did not, the check reports on the first and the
second silently disappears from its result. That omission belongs here, so that
§5.5's "not checked" section is complete rather than merely non-empty.

Nothing in here calls a model.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pv.checks import registry
from pv.ingest import ingest, ingest_directory
from pv.models import (
    CheckContext,
    CheckResult,
    NotChecked,
    ReasonCode,
    RunReport,
    SourceDocument,
    Table,
    Verdict,
)
from pv.parse import parse_document

DEFAULT_CHECKS = ("bold_extreme", "row_arithmetic", "links", "citations")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _table_name(table: Table) -> str:
    return table.label or table.caption[:48] or table.anchor.dom_id


def collect_not_checked(
    document: SourceDocument, tables: list[Table], results: list[CheckResult]
) -> list[NotChecked]:
    """Everything the run could not verify, with the specific reason.

    Three sources, none of which any single check can report on its own:
    the ingest stage, tables that failed to parse, and checks that declined.
    """
    out: list[NotChecked] = []

    # 1. Ingest fell short — e.g. a PDF-only submission with no LaTeX at all.
    if document.ingest_reason is not None:
        out.append(
            NotChecked(
                what=f"Source for {document.arxiv_id}",
                reason=document.ingest_reason,
                detail=document.ingest_detail,
            )
        )

    # 2. Tables the parser could not fully resolve. A check that evaluated three
    # tables and skipped a fourth still reports `matches`; the fourth lands here.
    for table in tables:
        if table.parse_warnings:
            out.append(
                NotChecked(
                    what=f"Table {_table_name(table)}",
                    reason=ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
                    detail="; ".join(table.parse_warnings[:3]),
                )
            )

    # 3. Checks that declined outright.
    for res in results:
        if res.verdict is Verdict.UNVERIFIABLE and res.reason is not None:
            out.append(
                NotChecked(
                    what=res.display_name or res.checker,
                    reason=res.reason,
                    detail=res.description,
                )
            )
        elif res.verdict is Verdict.NOT_ATTEMPTED:
            out.append(
                NotChecked(
                    what=res.display_name or res.checker,
                    reason=res.reason or ReasonCode.NO_APPLICABLE_CLAIMS,
                    detail=res.description,
                )
            )

    return out


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
    """
    started = _now()

    if from_directory is not None:
        result = ingest_directory(from_directory, arxiv_id=arxiv_id)
    else:
        result = ingest(arxiv_id, allow_network=allow_network)

    document = result.document
    if not result.ok and not document.assembled_latex:
        # Nothing to work with. Still a valid report — it just says so.
        return RunReport(
            arxiv_id=arxiv_id,
            title=document.title,
            checks=[],
            not_checked=[
                NotChecked(
                    what=f"Source for {arxiv_id}",
                    reason=result.reason or ReasonCode.NO_LATEX_SOURCE,
                    detail=result.detail,
                )
            ],
            started_at=started,
            finished_at=_now(),
        )

    tables = parse_document(document)
    ctx = CheckContext(document=document, tables=tables, llm_enabled=llm_enabled)
    results = registry.run_all(ctx, names=list(checks))

    return RunReport(
        arxiv_id=arxiv_id,
        title=document.title,
        checks=results,
        not_checked=collect_not_checked(document, tables, results),
        tables_parsed=len(tables),
        started_at=started,
        finished_at=_now(),
    )
