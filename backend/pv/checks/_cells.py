"""The cell vocabulary shared by claim mining and by the table checks.

`bold_extreme` used to hold these with a note that they "would live in a
`checks/_util.py` if this agent owned that path". They live here now, because
`pv.claims.mine` needs exactly the same reading of a cell that the checkers use.

That sameness is the point. Mining decides *what is claimed*; a checker decides
*whether it holds*. If the two read a cell differently — one seeing `86.7/85.9` as
a pair and the other as `86.7` — a verdict gets attached to a claim that was never
made. Every defect in CLAUDE.md is a version of that, so there is one function per
question and both sides call it.

Dependencies point one way: this module imports only `models`, `pv.claims` imports
this, and nothing in `pv.claims` is imported back into a checker.
"""

from __future__ import annotations

import re

from ..models import Anchor, Cell, Claim, Table
from ..fingerprint import claim_content_hash

_NUMBER = re.compile(r"-?\d+\.(\d+)")

# A cell holding several values, e.g. BERT's `86.7/85.9`. Deliberately strict: only
# slash-separated bare numbers count, so `86.7 +- 0.2` stays a single value.
_MULTI_VALUE = re.compile(r"^[-+]?\d+(?:\.\d+)?(?:\s*/\s*[-+]?\d+(?:\.\d+)?)+$")


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


def cell_values(cell: Cell) -> list[float]:
    """Every value a cell states.

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


def column_header(table: Table, col: int) -> str:
    for column in table.columns:
        if column.index == col:
            return column.header
    return ""


# --------------------------------------------------------------------------
# Claims over table cells
# --------------------------------------------------------------------------


def table_claims(table: Table) -> list[Claim]:
    """One `body_number` claim per non-header cell that states a value.

    Cell order, which is source order. A cell with no parseable number states
    nothing — empty cells in ML tables mean "not reported", never zero — so it
    yields no claim.

    `Claim.value` stays None when the cell holds several numbers, and every number
    goes into `normalized["values"]`. Taking the first would be the BERT bug
    (GROUND_TRUTH.md case 2) written into the claims table itself, where it would
    then be invisible to every checker downstream.
    """
    claims: list[Claim] = []
    for cell in table.cells:
        if cell.is_header:
            continue
        values = cell_values(cell)
        if not values:
            continue
        anchor = cell_anchor(table, cell.row, cell.col, column_header(table, cell.col))
        verbatim = (cell.text or "").strip()
        value = cell.value if len(values) == 1 else None
        claims.append(
            Claim(
                kind="body_number",
                locator=anchor.human_locator,
                verbatim=verbatim,
                anchor=anchor,
                value=value,
                normalized={
                    "values": values,
                    "table": table.anchor.dom_id,
                    "row": cell.row,
                    "col": cell.col,
                    "block": cell.block,
                    "colspan": cell.colspan,
                    "is_bold": cell.is_bold,
                },
                content_hash=claim_content_hash("body_number", anchor.dom_id, verbatim, value),
            )
        )
    return claims


def index_cells(tables: list[Table]) -> dict[str, tuple[Table, Cell]]:
    """dom_id -> (table, cell), for resolving a claim's anchor back to the source.

    Built once per run rather than per claim: a large paper carries a few thousand
    cells and every checker resolves every claim it is given.
    """
    index: dict[str, tuple[Table, Cell]] = {}
    for table in tables:
        base = table.anchor.dom_id or table.label or "table"
        for cell in table.cells:
            index.setdefault(f"{base}/r{cell.row}/c{cell.col}", (table, cell))
    return index


def resolve(claim: Claim, index: dict[str, tuple[Table, Cell]]) -> tuple[Table, Cell] | None:
    """The (table, cell) a claim points at, or None.

    §14.3: a claim whose anchor does not resolve is discarded silently. That is
    safe *only* because a claim we cannot locate is a claim we cannot check — it
    can carry no verdict, so dropping it accuses nobody of anything. Never extend
    that silence to a claim that did resolve.
    """
    return index.get(claim.anchor.dom_id)


__all__ = [
    "cell_anchor",
    "cell_values",
    "column_header",
    "decimals",
    "fmt",
    "index_cells",
    "resolve",
    "table_claims",
]
