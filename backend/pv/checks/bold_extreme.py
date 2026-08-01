"""Check 1 — a bolded value is not the best value in its column.

The naive form of this check ("the bolded cell must be the maximum of its whole
column") false-positives on real papers. See CLAUDE.md: tables are segmented into
rule-delimited blocks (single models / ensembles / ours) and each block bolds its
own winner, so the Transformer paper legitimately carries two bolds in one column.

This module therefore:
  - compares only within a `Cell.block`,
  - skips `Column.is_spacer` columns,
  - honours `Column.direction` (a bolded minimum is correct for perplexity, FID,
    WER, MSE, loss, error rate, training cost, ...),
  - and returns `unverifiable` with a `ReasonCode` for every situation it cannot
    settle deterministically. It never guesses.

Zero model calls.
"""

from __future__ import annotations

import re
from collections import defaultdict

from ..models import (
    Anchor,
    CheckContext,
    CheckResult,
    Column,
    Direction,
    Finding,
    ReasonCode,
    Severity,
    Table,
    Verdict,
)

CHECKER_NAME = "bold_extreme"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Bolded value is the best in its block"
DESCRIPTION = (
    "Checks that each bolded number is the best value in its column, comparing only "
    "within the same rule-delimited block of the table."
)

# Order in which competing reasons are reported when a check produced several.
# Structural failures outrank interpretive ones: if the table did not parse, that
# is the more useful thing to tell the reader.
_REASON_PRIORITY = (
    ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
    ReasonCode.CELL_SPANS_COLUMNS,
    ReasonCode.CELL_HAS_MULTIPLE_VALUES,
    ReasonCode.MULTIPLE_BOLD_IN_COLUMN,
    ReasonCode.METRIC_DIRECTION_UNKNOWN,
)

# Curated fallback used only when the column header carries no arrow. Matched as
# whole words against the normalised header, lower-is-better first: "top-1 error"
# is lower-is-better even though "top-1" alone would suggest otherwise.
_LOWER_IS_BETTER = (
    "perplexity", "ppl", "fid", "wer", "cer", "per", "der", "eer", "ece",
    "mse", "rmse", "mae", "nll", "bpc", "bpd",
    "loss", "error", "err", "regret", "violation",
    "cost", "flops", "latency", "runtime", "memory",
)
_HIGHER_IS_BETTER = (
    "bleu", "rouge", "meteor", "chrf", "ter", "cider", "spice",
    "accuracy", "acc", "f1", "em", "auc", "auroc", "map", "mrr", "ndcg",
    "precision", "recall", "iou", "miou", "dice", "psnr", "ssim",
    "correlation", "pearson", "spearman", "score", "reward", "win",
)

_NUMBER = re.compile(r"-?\d+\.(\d+)")


# --------------------------------------------------------------------------
# Small shared helpers. `row_arithmetic` imports these — they would live in a
# `checks/_util.py` if this agent owned that path.
# --------------------------------------------------------------------------


def decimals(text: str, value: float | None = None) -> int:
    """Number of digits printed after the decimal point, as displayed.

    Precision comes from the page, not from the float: `40.6` carries +-0.05 of
    rounding error regardless of what it parses to in binary.
    """
    match = _NUMBER.search(text or "")
    if match:
        return len(match.group(1))
    if value is not None and value != int(value):
        return len(repr(float(value)).partition(".")[2])
    return 0


def fmt(value: float, places: int) -> str:
    return f"{value:.{places}f}"


def cell_anchor(table: Table, row: int, col: int, header: str) -> Anchor:
    """Anchor for one table cell, following the dom_id convention in models.py."""
    base = table.anchor.dom_id or table.label or "table"
    name = table.label or (table.caption.split(".")[0][:40] if table.caption else "table")
    column_name = f' column "{header}"' if header else f" column {col}"
    return Anchor(
        kind="table_cell",
        dom_id=f"{base}/r{row}/c{col}",
        table_label=table.label,
        row=row,
        col=col,
        human_locator=f"{name}, row {row},{column_name}",
    )


def pick_reason(reasons: list[ReasonCode]) -> ReasonCode | None:
    for candidate in _REASON_PRIORITY:
        if candidate in reasons:
            return candidate
    return reasons[0] if reasons else None


# --------------------------------------------------------------------------
# Metric direction
# --------------------------------------------------------------------------


def resolve_direction(column: Column) -> Direction:
    """Direction of "better" for a column, deterministically.

    1. What the parser established (arrows in the header are the usual source).
    2. A curated metric-name lookup.
    3. Otherwise UNKNOWN — never assume "higher is better".
    """
    if column.direction is not Direction.UNKNOWN:
        return column.direction

    words = set(re.findall(r"[a-z0-9]+", f"{column.metric or ''} {column.header}".lower()))
    if words & set(_LOWER_IS_BETTER):
        return Direction.LOWER_IS_BETTER
    if words & set(_HIGHER_IS_BETTER):
        return Direction.HIGHER_IS_BETTER
    return Direction.UNKNOWN


# --------------------------------------------------------------------------
# The check
# --------------------------------------------------------------------------


def check_table(
    table: Table, *, respect_blocks: bool = True
) -> tuple[list[Finding], list[ReasonCode], int]:
    """Examine one table.

    Returns (findings, reasons, comparisons_made).

    `respect_blocks=False` compares across the whole column and is wrong for real
    papers — it exists so the test suite can demonstrate the false positive that
    block scoping prevents. Production callers must leave it True.
    """
    if table.parse_warnings:
        return [], [ReasonCode.TABLE_STRUCTURE_NOT_PARSED], 0

    columns = {column.index: column for column in table.columns}
    findings: list[Finding] = []
    reasons: list[ReasonCode] = []
    comparisons = 0

    # (block, col) -> cells. Header cells never participate.
    groups: dict[tuple[int, int], list] = defaultdict(list)
    for cell in table.cells:
        if cell.is_header:
            continue
        column = columns.get(cell.col)
        if column is not None and column.is_spacer:
            continue
        groups[(cell.block if respect_blocks else 0, cell.col)].append(cell)

    for (_, col), cells in sorted(groups.items()):
        column = columns.get(col) or Column(index=col)
        bolds = [c for c in cells if c.is_bold]
        if not bolds:
            continue

        spanning = [c for c in bolds if c.colspan > 1]
        if spanning:
            # A bolded \multicolumn belongs to no single column, so there is no
            # column to be the best of.
            reasons.append(ReasonCode.CELL_SPANS_COLUMNS)
            bolds = [c for c in bolds if c.colspan == 1]
            if not bolds:
                continue

        if any(len(c.values) > 1 for c in cells):
            # BERT bolds `{\bf 86.7/85.9}`: a pair has no single value to be the
            # best of. The same applies when a *peer* holds a pair — comparing the
            # bold against the single-valued cells alone would silently narrow the
            # column. Widening it instead would let a peer's second value convict a
            # paper whose convention only ever compares first values, so we decline
            # and say that we declined.
            reasons.append(ReasonCode.CELL_HAS_MULTIPLE_VALUES)
            continue

        # A bolded label or a bolded cell with no parseable number makes no
        # numeric claim; there is nothing to compare.
        bolds = [c for c in bolds if c.value is not None]
        if not bolds:
            continue

        if len(bolds) > 1:
            reasons.append(ReasonCode.MULTIPLE_BOLD_IN_COLUMN)
            continue

        direction = resolve_direction(column)
        if direction is Direction.UNKNOWN:
            reasons.append(ReasonCode.METRIC_DIRECTION_UNKNOWN)
            continue

        # Empty cells mean "not reported", never zero, so they are excluded.
        peers = [c for c in cells if c.value is not None and c.colspan == 1]
        bold = bolds[0]
        best_cell = (
            max(peers, key=lambda c: c.value)
            if direction is Direction.HIGHER_IS_BETTER
            else min(peers, key=lambda c: c.value)
        )
        comparisons += 1

        places = max(decimals(c.text, c.value) for c in peers)
        # Two values that agree to the precision they were printed at are a tie.
        epsilon = 0.5 * 10 ** (-places)
        gap = abs(best_cell.value - bold.value)
        if gap <= epsilon:
            continue

        better = "higher" if direction is Direction.HIGHER_IS_BETTER else "lower"
        header = column.header or column.metric or ""
        findings.append(
            Finding(
                severity=Severity.MEDIUM,
                claimed=fmt(bold.value, places),
                computed=fmt(best_cell.value, places),
                delta=f"{bold.value - best_cell.value:+.{places}f}",
                anchor=cell_anchor(table, bold.row, bold.col, header),
                explanation=(
                    f"{fmt(bold.value, places)} is bolded, but "
                    f"{fmt(best_cell.value, places)} in the same block of this column "
                    f"is {better}."
                ),
            )
        )

    return findings, reasons, comparisons


def run(ctx: CheckContext) -> CheckResult:
    findings: list[Finding] = []
    reasons: list[ReasonCode] = []
    comparisons = 0

    for table in ctx.tables:
        table_findings, table_reasons, made = check_table(table)
        findings.extend(table_findings)
        reasons.extend(table_reasons)
        comparisons += made

    if findings:
        verdict, reason = Verdict.DIVERGES, None
    elif comparisons:
        verdict, reason = Verdict.MATCHES, None
    elif reasons:
        verdict, reason = Verdict.UNVERIFIABLE, pick_reason(reasons)
    else:
        # No bolded numbers anywhere — there was nothing for this check to do.
        verdict, reason = Verdict.NOT_ATTEMPTED, None

    return CheckResult(
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        verdict=verdict,
        reason=reason,
        findings=findings,
        display_name=DISPLAY_NAME,
        description=DESCRIPTION,
    )
