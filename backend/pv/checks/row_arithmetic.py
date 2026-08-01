"""Check 3 — an average column does not equal the mean of its row.

Three things make this harder than it looks, and all three push towards
`unverifiable`:

  - **The denominator of an average is not knowable from the row alone.** BERT's
    GLUE table (`fixtures/GROUND_TRUTH.md`, case 2) averages *nine* values across
    *eight* data columns, because the `MNLI-(m/mm)` cells hold a slash-separated
    pair. Read as eight, all five rows appear to diverge by 0.5-0.76 — five false
    accusations against a landmark paper. So every plausible reading of the row is
    tried before any verdict, and an ambiguous denominator is `unverifiable`.
  - **Tolerance is not a constant.** A row printed to one decimal place carries
    +-0.05 of rounding error per value; propagated through the mean that stays
    +-0.05, and the printed average hides half a unit of its own on top. The band
    is derived from displayed precision, never hard-coded.
  - **Weighted averages exist and are undetectable from the table.** If some
    weighting of the row's values reproduces the stated number, an arithmetic mean
    and a weighted mean cannot be told apart here.

`diverges` is therefore a high bar: no plausible reading reproduces the value, and
the gap clears rounding by a clear margin.

Zero model calls.
"""

from __future__ import annotations

import re

from ..models import (
    Cell,
    CheckContext,
    CheckResult,
    Finding,
    ReasonCode,
    Severity,
    Table,
    Verdict,
)
from .bold_extreme import cell_anchor, decimals, fmt

CHECKER_NAME = "row_arithmetic"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Average columns match their row"
DESCRIPTION = (
    "Checks that a column labelled average, mean or overall equals the mean of the "
    "other numbers in the same row, to the precision they were printed at."
)

# Header words that mark a column as the average of the others in its row.
_AVERAGE_WORDS = {"avg", "average", "mean", "overall", "all"}

_AMBIGUOUS_REASON = ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS

# A cell holding several values, e.g. BERT's `86.7/85.9`. Deliberately strict: only
# slash-separated bare numbers count, so `86.7 +- 0.2` stays a single value.
_MULTI_VALUE = re.compile(r"^[-+]?\d+(?:\.\d+)?(?:\s*/\s*[-+]?\d+(?:\.\d+)?)+$")


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def is_average_column(header: str, metric: str | None = None) -> bool:
    return bool(_words(f"{metric or ''} {header}") & _AVERAGE_WORDS)


def cell_values(cell: Cell) -> list[float]:
    """Every value a cell contributes to an average.

    Usually one. `86.7/85.9` is two — MNLI matched and mismatched, counted
    separately in BERT's average.

    `Cell.values` is authoritative when the parser populated it. The slash-parsing
    fallback covers cells that predate the field; it is deliberately strict, so
    `86.7 +- 0.2` stays a single value.
    """
    if cell.values:
        return list(cell.values)
    text = (cell.text or "").strip()
    if _MULTI_VALUE.match(text):
        return [float(part) for part in text.split("/")]
    return [cell.value] if cell.value is not None else []


def _half_unit(cell: Cell) -> float:
    """Half a unit in the last place the cell was printed to — its rounding error."""
    return 0.5 * 10 ** -decimals(cell.text, cell.value)


def _data_columns(table: Table, average_cols: set[int]) -> list[int]:
    """Columns holding the numbers an average would be taken over.

    A column counts as data when at least half of its non-header cells carry
    values, which excludes model-name and citation columns without guessing at
    their content.

    A column that is blank throughout also counts, so that a row with a hole in it
    comes out `unverifiable` rather than quietly averaging the columns that remain.
    A column that is decorative rather than unreported is the parser's `is_spacer`.
    """
    data: list[int] = []
    for column in table.columns:
        if column.is_spacer or column.index in average_cols:
            continue
        cells = table.column_cells(column.index)
        if not cells:
            continue
        numeric = [c for c in cells if cell_values(c)]
        blank = [c for c in cells if not (c.text or "").strip()]
        if (numeric and len(numeric) * 2 >= len(cells)) or len(blank) == len(cells):
            data.append(column.index)
    return data


def _mean_and_band(values: list[tuple[float, float]]) -> tuple[float, float]:
    """Mean of (value, half_unit) pairs, and the rounding band it inherits."""
    mean = sum(value for value, _ in values) / len(values)
    band = sum(half for _, half in values) / len(values)
    return mean, band


def _readings(cells: list[Cell]) -> list[list[tuple[float, float]]]:
    """The plausible ways to read a row, most defensible first.

    1. Every value in the row, multi-value cells counted once per value. This is
       what BERT does.
    2. One value per cell.

    Both are principled readings of the whole row, so either may produce `matches`.
    """
    per_cell = [[(v, _half_unit(cell)) for v in cell_values(cell)] for cell in cells]
    all_values = [pair for group in per_cell for pair in group]
    first_only = [group[0] for group in per_cell]
    readings = [all_values]
    if first_only != all_values:
        readings.append(first_only)
    return readings


def _subset_readings(cells: list[Cell]) -> list[list[tuple[float, float]]]:
    """Readings over part of the row — one cell, or one value, left out.

    These can only downgrade a divergence to `unverifiable`: if dropping a column
    reproduces the stated number, we cannot know which columns were averaged, and
    that ambiguity is not the paper's mistake.
    """
    out: list[list[tuple[float, float]]] = []
    for reading in _readings(cells):
        if len(reading) < 3:
            continue
        for i in range(len(reading)):
            out.append(reading[:i] + reading[i + 1 :])
    return out


def check_table(table: Table) -> tuple[list[Finding], list[ReasonCode], dict[Verdict, int]]:
    """Examine one table. Returns (findings, reasons, count of rows per verdict)."""
    tally: dict[Verdict, int] = {}
    if table.parse_warnings:
        # Includes the case where the parser could not represent a multi-value
        # cell. A hole in the row is not a licence to average what remains.
        return [], [ReasonCode.TABLE_STRUCTURE_NOT_PARSED], tally

    columns = {column.index: column for column in table.columns}
    average_cols = {
        column.index
        for column in table.columns
        if not column.is_spacer and is_average_column(column.header, column.metric)
    }
    if not average_cols:
        return [], [], tally

    data_cols = _data_columns(table, average_cols)
    findings: list[Finding] = []
    reasons: list[ReasonCode] = []

    by_row: dict[int, dict[int, Cell]] = {}
    for cell in table.cells:
        if not cell.is_header:
            by_row.setdefault(cell.row, {})[cell.col] = cell

    def note(verdict: Verdict) -> None:
        tally[verdict] = tally.get(verdict, 0) + 1

    for row in sorted(by_row):
        cells = by_row[row]
        for avg_col in sorted(average_cols):
            stated = cells.get(avg_col)
            if stated is None or stated.value is None or stated.colspan > 1:
                continue  # No average stated on this row; nothing is claimed.

            peers = [cells.get(col) for col in data_cols]
            usable = [c for c in peers if c is not None and c.colspan == 1 and cell_values(c)]
            if len(usable) != len(peers) or len(usable) < 2:
                # An empty cell means "not reported". With a hole in the row we
                # cannot know what the average was taken over.
                reasons.append(ReasonCode.NO_NUMERIC_VALUES)
                note(Verdict.UNVERIFIABLE)
                continue

            avg_places = decimals(stated.text, stated.value)
            places = max(avg_places, *(decimals(c.text, c.value) for c in usable))
            header = columns[avg_col].header if avg_col in columns else ""
            anchor = cell_anchor(table, row, avg_col, header)

            # Best of the principled whole-row readings.
            scored = [_mean_and_band(r) for r in _readings(usable)]
            computed, band = min(scored, key=lambda mb: abs(stated.value - mb[0]))
            delta = stated.value - computed
            # The printed average hides half a unit of its own; allowing it is what
            # separates "within tolerance" from "matches".
            slack = 0.5 * 10**-avg_places

            claimed_text = fmt(stated.value, avg_places)
            detail = places + 2

            if abs(delta) <= band:
                note(Verdict.MATCHES)
                continue

            if abs(delta) <= band + slack:
                note(Verdict.WITHIN_TOLERANCE)
                findings.append(
                    Finding(
                        severity=Severity.LOW,
                        claimed=claimed_text,
                        computed=fmt(computed, detail),
                        delta=f"{delta:+.{detail}f}",
                        anchor=anchor,
                        explanation=(
                            f"The stated average {claimed_text} is {abs(delta):.{detail}f} "
                            f"from the mean of its row, {fmt(computed, detail)} — just "
                            "outside the rounding implied by the printed precision."
                        ),
                    )
                )
                continue

            all_values = [value for value, _ in _readings(usable)[0]]
            subset_match = any(
                abs(stated.value - mean) <= subset_band
                for mean, subset_band in map(_mean_and_band, _subset_readings(usable))
            )
            in_range = min(all_values) - band <= stated.value <= max(all_values) + band

            if subset_match or in_range:
                # Either some subset of the row reproduces the number, or some
                # weighting of it does. Both leave a reading under which the paper
                # is right, so there is nothing here we can assert. The comparison
                # is still attached: the reader sees the numbers and decides.
                other_reading = (
                    "averaging a subset of the columns" if subset_match else "a weighted average"
                )
                reasons.append(_AMBIGUOUS_REASON)
                note(Verdict.UNVERIFIABLE)
                findings.append(
                    Finding(
                        severity=Severity.LOW,
                        claimed=claimed_text,
                        computed=fmt(computed, detail),
                        delta=f"{delta:+.{detail}f}",
                        anchor=anchor,
                        explanation=(
                            f"Stated {claimed_text}; the unweighted mean of the row is "
                            f"{fmt(computed, detail)}. Nothing states how the average was "
                            f"taken, and {other_reading} would give the stated value, so "
                            "this cannot be called a divergence."
                        ),
                    )
                )
                continue

            note(Verdict.DIVERGES)
            findings.append(
                Finding(
                    severity=Severity.HIGH,
                    claimed=claimed_text,
                    computed=fmt(computed, detail),
                    delta=f"{delta:+.{detail}f}",
                    anchor=anchor,
                    explanation=(
                        f"The stated average {claimed_text} lies outside the range of the "
                        f"values in its row, which mean {fmt(computed, detail)}."
                    ),
                )
            )

    return findings, reasons, tally


def run(ctx: CheckContext) -> CheckResult:
    findings: list[Finding] = []
    reasons: list[ReasonCode] = []
    tally: dict[Verdict, int] = {}

    for table in ctx.tables:
        table_findings, table_reasons, table_tally = check_table(table)
        findings.extend(table_findings)
        reasons.extend(table_reasons)
        for verdict, count in table_tally.items():
            tally[verdict] = tally.get(verdict, 0) + count

    reason = None
    if tally.get(Verdict.DIVERGES):
        verdict = Verdict.DIVERGES
    elif tally.get(Verdict.WITHIN_TOLERANCE):
        verdict = Verdict.WITHIN_TOLERANCE
    elif tally.get(Verdict.MATCHES):
        verdict = Verdict.MATCHES
    elif reasons:
        verdict = Verdict.UNVERIFIABLE
        reason = (
            ReasonCode.TABLE_STRUCTURE_NOT_PARSED
            if ReasonCode.TABLE_STRUCTURE_NOT_PARSED in reasons
            else reasons[0]
        )
    else:
        # No average column anywhere — there was nothing for this check to do.
        verdict = Verdict.NOT_ATTEMPTED

    return CheckResult(
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        verdict=verdict,
        reason=reason,
        findings=findings,
        display_name=DISPLAY_NAME,
        description=DESCRIPTION,
    )
