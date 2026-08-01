"""Generate the static `RunReport` fixtures the frontend builds against.

Orchestrator-owned. Writes fixtures/reports/*.json.

The frontend never talks to a live backend until the checker is validated
(docs/OWNERSHIP.md). These files are the contract made concrete: they are real
`RunReport` objects serialised by Pydantic, so any drift between the model and the
UI shows up as a schema change here rather than as a surprise at wiring time.

Two kinds of file:

  <arxiv_id>.json   Real output of the real pipeline on a real paper.

  synthetic.json    Hand-authored, and clearly labelled as such. It exists because
                    the real corpus currently produces no `diverges` at all, so the
                    §5.4 finding-detail screen -- the core screen of the product --
                    has nothing to render from real data. Every verdict, several
                    reason codes, and a populated comparison block appear here.
                    The paper it describes does not exist. Do not present it as a
                    finding about anyone.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from pv.models import (  # noqa: E402
    Anchor,
    CheckResult,
    Finding,
    NotChecked,
    ReasonCode,
    RunReport,
    Severity,
    Verdict,
)
from pv.run import run_paper  # noqa: E402

OUT = Path(__file__).parent / "reports"
PAPERS = Path(__file__).parent / "papers"

# Chosen for UI coverage rather than fame: one clean, one with a real
# within-tolerance finding, one dominated by unverifiable, one large.
REAL = ["1706.03762", "1810.04805", "1512.03385", "2103.00020"]


def synthetic() -> RunReport:
    """Every verdict state in one report. Not a real paper."""
    return RunReport(
        arxiv_id="0000.00000",
        title="A synthetic paper for interface development",
        tables_parsed=3,
        started_at=datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
        finished_at=datetime(2026, 8, 1, 12, 0, 9, tzinfo=timezone.utc),
        checks=[
            CheckResult(
                checker="bold_extreme",
                checker_version="1",
                display_name="Bolded value is the best in its block",
                description="Compares each bolded cell with the other values in its "
                "column, within the block the table's rules define.",
                verdict=Verdict.DIVERGES,
                duration_ms=310,
                findings=[
                    Finding(
                        severity=Severity.HIGH,
                        claimed="87.4",
                        computed="84.1",
                        delta="-3.3",
                        anchor=Anchor(
                            kind="table_cell",
                            dom_id="tab:main/r2/c3",
                            table_label="tab:main",
                            row=2,
                            col=3,
                            human_locator='Table 3, row 2, column "Ours"',
                        ),
                        explanation="87.4 is bolded, but 84.1 is the highest value in "
                        "this block of the column.",
                    )
                ],
            ),
            CheckResult(
                checker="row_arithmetic",
                checker_version="1",
                display_name="Average columns match their row",
                description="Recomputes each average column from the values in its "
                "row and compares, allowing for the precision shown.",
                verdict=Verdict.WITHIN_TOLERANCE,
                duration_ms=95,
                findings=[
                    Finding(
                        severity=Severity.LOW,
                        claimed="71.0",
                        computed="70.944",
                        delta="+0.056",
                        anchor=Anchor(
                            kind="table_cell",
                            dom_id="tab:glue/r3/c9",
                            table_label="tab:glue",
                            row=3,
                            col=9,
                            human_locator='Table 1, row 3, column "Average"',
                        ),
                        explanation="Within the rounding implied by one decimal place.",
                    )
                ],
            ),
            CheckResult(
                checker="dead_links",
                checker_version="1",
                display_name="Links resolve",
                description="Requests every URL in the paper and reports those that "
                "return not-found.",
                verdict=Verdict.MATCHES,
                duration_ms=2140,
            ),
            CheckResult(
                checker="citation_existence",
                checker_version="1",
                display_name="Citations exist",
                description="Looks up each reference in Crossref and OpenAlex, and "
                "reports confirmed retractions.",
                verdict=Verdict.UNVERIFIABLE,
                reason=ReasonCode.REFERENCE_NOT_INDEXED,
                duration_ms=41800,
            ),
            CheckResult(
                checker="abstract_vs_table",
                checker_version="1",
                display_name="Abstract agrees with the tables",
                description="Matches numbers stated in the abstract to the cells they "
                "refer to.",
                verdict=Verdict.NOT_ATTEMPTED,
                reason=ReasonCode.LLM_DISABLED,
            ),
        ],
        not_checked=[
            NotChecked(
                what="Table tab:ablation",
                reason=ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
                detail="No full-width rule separates a header from the body.",
            ),
            NotChecked(
                what="Column “Score” in tab:main",
                reason=ReasonCode.METRIC_DIRECTION_UNKNOWN,
                detail="No arrow in the header and the metric is not in the lookup.",
            ),
            NotChecked(
                what="Abstract agrees with the tables",
                reason=ReasonCode.LLM_DISABLED,
                detail="Set LLM_ENABLED=true to run this check.",
            ),
            NotChecked(
                what="Reference 14",
                reason=ReasonCode.REFERENCE_NOT_INDEXED,
                detail="Present in neither Crossref nor OpenAlex.",
            ),
        ],
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    for arxiv_id in REAL:
        d = PAPERS / arxiv_id
        if not d.is_dir():
            print(f"  skip {arxiv_id}: not in the corpus")
            continue
        report = run_paper(
            arxiv_id,
            from_directory=str(d),
            checks=("bold_extreme", "row_arithmetic"),
        )
        path = OUT / f"{arxiv_id}.json"
        path.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        written.append(path)
        n_find = sum(len(c.findings) for c in report.checks)
        print(f"  {arxiv_id}  {report.tables_parsed:>3} tables  {n_find} findings  "
              f"{len(report.not_checked)} not checked")

    path = OUT / "synthetic.json"
    path.write_text(synthetic().model_dump_json(indent=2), encoding="utf-8")
    written.append(path)
    print("  synthetic  every verdict state, not a real paper")

    # The schema itself, so the frontend can generate types before FastAPI exists.
    schema = OUT / "run-report.schema.json"
    schema.write_text(json.dumps(RunReport.model_json_schema(), indent=2), encoding="utf-8")
    written.append(schema)
    print(f"\n{len(written)} files in {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
