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

import argparse
import difflib
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
                        verbatim="Our method reaches 87.4 on the held-out split, "
                        "outperforming all prior work.",
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
                # §7: name things by what the user controls, not by system
                # internals. An env var is not something the reader can act on.
                detail="Language model extraction is turned off for this run.",
            ),
            NotChecked(
                what="Reference 14",
                reason=ReasonCode.REFERENCE_NOT_INDEXED,
                detail="Present in neither Crossref nor OpenAlex.",
            ),
        ],
    )


# The LaTeX a cell and a table came from. Kept on the model because a checker may
# need it, dropped from the serialised report because the frontend never reads it.
#
# CLIP's report was 1.4MB with these in, and prerendering the report pages died with
# "Zone Allocation failed - process out of memory" at page 7 of 15. Nothing about the
# verdicts changes: no check reads a report back, and the corpus gate compares the
# same fields either way.
_RENDER_EXCLUDE = {
    "tables": {
        "__all__": {
            "latex_source": True,
            "cells": {"__all__": {"raw_latex": True}},
        }
    }
}


def _render_all() -> dict[str, str]:
    """Every fixture's JSON, keyed by filename. Pure — writes nothing."""
    out: dict[str, str] = {}
    for arxiv_id in REAL:
        d = PAPERS / arxiv_id
        if not d.is_dir():
            continue
        report = run_paper(
            arxiv_id, from_directory=str(d), checks=("bold_extreme", "row_arithmetic")
        )
        out[f"{arxiv_id}.json"] = report.model_dump_json(
            indent=2, exclude=_RENDER_EXCLUDE
        )
    out["synthetic.json"] = synthetic().model_dump_json(indent=2)
    out["run-report.schema.json"] = json.dumps(RunReport.model_json_schema(), indent=2)
    return out


# Fields that change on every run and say nothing about what we would accuse a
# researcher of. The gate compares verdicts and evidence, not wall-clock timing —
# otherwise it fails on every commit and gets switched off, which is worse than
# not having it.
_VOLATILE = {"started_at", "finished_at", "created_at", "duration_ms"}


def _stable(payload: str) -> str:
    """Strip volatile fields so the diff is about findings, not timing."""

    def scrub(node):
        if isinstance(node, dict):
            return {k: scrub(v) for k, v in node.items() if k not in _VOLATILE}
        if isinstance(node, list):
            return [scrub(v) for v in node]
        return node

    return json.dumps(scrub(json.loads(payload)), indent=2, sort_keys=True)


def verify() -> int:
    """Regenerate in memory and diff against what is committed.

    The corpus gate (§15.3). Any change to what the system would accuse a
    researcher of fails the build unless the expected files move in the same
    commit. This is the only thing standing between an autonomous agent
    "improving" a checker and a different set of public accusations.
    """
    drifted = []
    for name, fresh in _render_all().items():
        path = OUT / name
        if not path.exists():
            print(f"  MISSING  {name} — not committed")
            drifted.append(name)
            continue
        committed = path.read_text(encoding="utf-8")
        if _stable(committed) == _stable(fresh):
            print(f"  ok       {name}")
            continue
        drifted.append(name)
        print(f"  DRIFTED  {name}")
        diff = difflib.unified_diff(
            _stable(committed).splitlines(), _stable(fresh).splitlines(),
            fromfile=f"committed/{name}", tofile=f"regenerated/{name}", lineterm="", n=2,
        )
        for line in list(diff)[:60]:
            print(f"      {line}")

    if drifted:
        print(
            f"\n{len(drifted)} fixture(s) drifted. The checker now produces different"
            " output than what is committed.\nIf the change is intended, run"
            " `python fixtures/make_reports.py` and commit the result in the same"
            " change. If it is not, the checker regressed."
        )
        return 1
    print("\nNo drift. The corpus produces exactly what is committed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--verify", action="store_true",
        help="diff regenerated reports against the committed ones and fail on drift",
    )
    if parser.parse_args().verify:
        return verify()

    # Write what verify() checks, from the same function. Two code paths building
    # the same files is how they drift: this one used to serialise without
    # _RENDER_EXCLUDE, so the committed fixtures kept every cell's raw LaTeX and
    # the frontend build ran out of memory prerendering them.
    OUT.mkdir(parents=True, exist_ok=True)
    rendered = _render_all()
    for name, payload in rendered.items():
        (OUT / name).write_text(payload, encoding="utf-8")
        print(f"  {name:28s} {len(payload) // 1024:>5} KB")
    print(f"\n{len(rendered)} files in {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
