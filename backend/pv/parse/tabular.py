"""LaTeX `tabular` -> `list[Table]`.

This is the load-bearing stage: every check reads what comes out of here. Two
principles govern it.

1. Structure is derived, never inferred. Where the source is ambiguous the table
   carries a `parse_warning` and the affected field stays empty, so downstream
   checks can return `unverifiable` instead of guessing.
2. Column index is not cell index. `\\multicolumn`, spacer columns and `@{...}`
   inserts all break that assumption, and all three appear in the corpus.
"""

from __future__ import annotations

from pv.models import Anchor, Cell, Column, Table

from . import bold as bold_mod
from . import direction as direction_mod
from . import numbers as numbers_mod
from .colspec import collect_column_types, count_columns
from .latexutil import (
    blank_comments,
    clean_latex,
    expand_macros,
    read_bracket,
    read_cs_name,
    read_group,
    skip_ws,
    split_cells,
    split_rows,
)

# Environments that hold a column-oriented body. `tabular*` is here because
# BERT's GLUE table — the most important table in the corpus — uses it.
TABULAR_ENVS: tuple[str, ...] = (
    "tabular",
    "tabular*",
    "tabularx",
    "tabulary",
    "longtable",
    "supertabular",
)
# These take a target-width argument before the column spec.
WIDTH_ENVS = frozenset({"tabular*", "tabularx", "tabulary"})

FLOAT_ENVS = ("table", "table*", "figure", "figure*", "wraptable", "sidewaystable")

# Rules that span the full width and therefore start a new block. `\cmidrule`
# and `\cline` cover part of the width only and must not: the Transformer's
# header uses `\cmidrule{2-3} \cmidrule{5-6}` between two header rows.
FULL_WIDTH_RULES = frozenset(
    {"hline", "toprule", "midrule", "bottomrule", "hdashline", "specialrule", "Xhline"}
)
PARTIAL_RULES = frozenset({"cmidrule", "cline", "morecmidrules"})
# Consumed at the start of a row but structurally inert.
INERT_LEADING = frozenset({"addlinespace", "noalign", "rowcolor", "arrayrulecolor"})

_RULE_ARGS: dict[str, int] = {
    "specialrule": 3,
    "cmidrule": 1,
    "cline": 1,
    "noalign": 1,
    "rowcolor": 1,
    "arrayrulecolor": 1,
}

# Headers are the rows before the first full-width rule that follows a row. More
# than this many and we decline to call them headers.
MAX_HEADER_ROWS = 3


# --------------------------------------------------------------------------
# Locating tabulars in the source
# --------------------------------------------------------------------------


def _discover_positions(src: str) -> tuple[list[int], list[str]]:
    """Offsets of every `\\begin{tabular...}` in `src`.

    TexSoup is the primary parser — it handled all three Transformer tabulars,
    BERT's `tabular*` and all fifteen in ResNet, and tolerates malformed input
    that plasTeX rejects. If it fails outright we fall back to a direct scan and
    say so, rather than silently reporting zero tables.
    """
    warnings: list[str] = []
    try:
        from TexSoup import TexSoup

        soup = TexSoup(src)
        positions = sorted(
            node.position for env in TABULAR_ENVS for node in soup.find_all(env)
        )
        if positions:
            return positions, warnings
    except Exception as exc:  # TexSoup raises a family of parse errors
        warnings.append(f"TexSoup could not parse the source ({type(exc).__name__}); scanned directly")

    positions = []
    i = 0
    while True:
        i = src.find("\\begin{", i)
        if i < 0:
            break
        name, j = read_group(src, i + len("\\begin"))
        if name in TABULAR_ENVS:
            positions.append(i)
        i += 1
    return sorted(set(positions)), warnings


def _env_span(src: str, pos: int) -> tuple[str, str, int, int, int] | None:
    """(env_name, colspec, body_start, body_end, end_of_environment)."""
    name, i = read_group(src, pos + len("\\begin"))
    if name not in TABULAR_ENVS:
        return None
    i = skip_ws(src, i)
    if i < len(src) and src[i] == "[":
        _, i = read_bracket(src, i)
        i = skip_ws(src, i)
    if name in WIDTH_ENVS:
        _, i = read_group(src, i)  # target width, e.g. {\textwidth}
        i = skip_ws(src, i)
    colspec, i = read_group(src, i)

    body_start = i
    depth = 1
    j = i
    open_tok = "\\begin{" + name + "}"
    close_tok = "\\end{" + name + "}"
    while j < len(src):
        nxt_open = src.find(open_tok, j)
        nxt_close = src.find(close_tok, j)
        if nxt_close < 0:
            return name, colspec, body_start, len(src), len(src)
        if 0 <= nxt_open < nxt_close:
            depth += 1
            j = nxt_open + len(open_tok)
            continue
        depth -= 1
        if depth == 0:
            return name, colspec, body_start, nxt_close, nxt_close + len(close_tok)
        j = nxt_close + len(close_tok)
    return name, colspec, body_start, len(src), len(src)


def _float_spans(src: str) -> list[tuple[int, int]]:
    """Spans of every float environment, innermost-last."""
    spans: list[tuple[int, int]] = []
    stack: list[tuple[str, int]] = []
    i = 0
    while True:
        b = src.find("\\begin{", i)
        e = src.find("\\end{", i)
        if b < 0 and e < 0:
            break
        if b >= 0 and (e < 0 or b < e):
            name, _ = read_group(src, b + len("\\begin"))
            if name in FLOAT_ENVS:
                stack.append((name, b))
            i = b + 1
        else:
            name, after = read_group(src, e + len("\\end"))
            if name in FLOAT_ENVS:
                for k in range(len(stack) - 1, -1, -1):
                    if stack[k][0] == name:
                        spans.append((stack[k][1], after))
                        del stack[k:]
                        break
            i = e + 1
    # Unclosed floats (ResNet comments out an \end{table*}) still get a span.
    for _name, start in stack:
        spans.append((start, len(src)))
    return spans


def _nearest_command_arg(src: str, region: tuple[int, int], command: str, near: int) -> str | None:
    """The argument of the `command` occurrence closest to offset `near`."""
    lo, hi = region
    best: tuple[int, str] | None = None
    i = lo
    token = "\\" + command
    while True:
        i = src.find(token, i)
        if i < 0 or i >= hi:
            break
        after = i + len(token)
        if after < len(src) and src[after].isalpha():
            i = after
            continue
        j = skip_ws(src, after)
        if j < len(src) and src[j] == "[":
            _, j = read_bracket(src, j)
            j = skip_ws(src, j)
        arg, _ = read_group(src, j)
        dist = abs(i - near)
        if arg and (best is None or dist < best[0]):
            best = (dist, arg)
        i = after
    return best[1] if best else None


# --------------------------------------------------------------------------
# Rows and rules
# --------------------------------------------------------------------------


def _strip_leading_rules(seg: str) -> tuple[str, int, int]:
    """Consume rule commands at the start of a row segment.

    Rules are glued to row content in real sources: `\\hline\\rule{0pt}{2.0ex}base
    & 6 & ...`. `\\rule` is spacing junk, not a horizontal rule, and is left for
    `clean_latex` to remove.
    """
    i = 0
    n_full = n_partial = 0
    n = len(seg)
    while True:
        j = skip_ws(seg, i)
        if j >= n or seg[j] != "\\":
            break
        name, k = read_cs_name(seg, j)
        if name not in FULL_WIDTH_RULES and name not in PARTIAL_RULES and name not in INERT_LEADING:
            break
        # Optional decorations, then the fixed arguments this rule takes.
        k = skip_ws(seg, k)
        while k < n and seg[k] in "([":
            if seg[k] == "[":
                _, k = read_bracket(seg, k)
            else:
                end = seg.find(")", k)
                k = len(seg) if end < 0 else end + 1
            k = skip_ws(seg, k)
        for _ in range(_RULE_ARGS.get(name, 0)):
            k = skip_ws(seg, k)
            if k < n and seg[k] == "{":
                _, k = read_group(seg, k)
            else:
                break
        if name in FULL_WIDTH_RULES:
            n_full += 1
        elif name in PARTIAL_RULES:
            n_partial += 1
        i = k
    return seg[i:], n_full, n_partial


def _find_span_command(s: str) -> int:
    """Offset of the first top-level `\\multicolumn`/`\\multirow`, or -1.

    Not necessarily at the start of the cell: the Transformer glues spacing junk
    in front of it (`\\rule{0pt}{2.0ex}\\multirow{4}{*}{(A)}`), and a span command
    buried inside a brace group belongs to that group, not to the cell.
    """
    i, n = 0, len(s)
    depth = 0
    while i < n:
        c = s[i]
        if c == "\\":
            name, j = read_cs_name(s, i)
            if depth == 0 and name in ("multicolumn", "multirow"):
                return i
            i = j
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return -1


def _cell_spans(raw: str) -> tuple[str, int, int]:
    """Unwrap `\\multicolumn` / `\\multirow`. Returns (content, colspan, rowspan)."""
    colspan = rowspan = 1
    s = raw.strip()
    for _ in range(4):  # they nest, e.g. \multicolumn{2}{c}{\multirow{2}{*}{X}}
        start = _find_span_command(s)
        if start < 0:
            break
        s = s[start:]
        name, i = read_cs_name(s, 0)
        if name == "multicolumn":
            count, i = read_group(s, skip_ws(s, i))
            _, i = read_group(s, skip_ws(s, i))  # alignment spec
            content, i = read_group(s, skip_ws(s, i))
            try:
                colspan = max(1, int(count.strip()))
            except ValueError:
                pass
            s = content
            continue
        if name == "multirow":
            count, i = read_group(s, skip_ws(s, i))
            i = skip_ws(s, i)
            while i < len(s) and s[i] == "[":
                _, i = read_bracket(s, i)
                i = skip_ws(s, i)
            _, i = read_group(s, i)  # width, usually {*}
            i = skip_ws(s, i)
            while i < len(s) and s[i] == "[":
                _, i = read_bracket(s, i)
                i = skip_ws(s, i)
            content, i = read_group(s, i)
            try:
                rowspan = max(1, int(count.strip()))
            except ValueError:
                pass
            s = content
            continue
        break
    return s, colspan, rowspan


# --------------------------------------------------------------------------
# Table assembly
# --------------------------------------------------------------------------


def _table_dom_id(label: str | None, ordinal: int) -> str:
    if label:
        return label if ":" in label else f"tab:{label}"
    return f"tab:table-{ordinal}"


def cell_anchor(table: Table, cell: Cell) -> Anchor:
    """Anchor for one cell. `Cell` itself carries no anchor field, so consumers
    build one from the table plus the cell's row/col."""
    column_name = ""
    for column in table.columns:
        if column.index == cell.col:
            column_name = column.header
            break
    locator = f"row {cell.row}, column {cell.col}"
    if column_name:
        locator = f'row {cell.row}, column "{column_name}"'
    return Anchor(
        kind="table_cell",
        dom_id=f"{table.anchor.dom_id}/r{cell.row}/c{cell.col}",
        table_label=table.label,
        row=cell.row,
        col=cell.col,
        human_locator=locator,
    )


def _build_table(
    *,
    body: str,
    colspec: str,
    latex_source: str,
    label: str | None,
    caption: str,
    dom_id: str,
    macros: dict[str, str],
    column_types: dict[str, int],
    warnings: list[str],
) -> Table:
    warnings = list(warnings)
    n_cols, spec_warnings = count_columns(colspec, column_types)
    warnings.extend(spec_warnings)

    table = Table(
        label=label,
        caption=caption,
        anchor=Anchor(
            kind="table",
            dom_id=dom_id,
            table_label=label,
            human_locator=caption[:120] if caption else dom_id,
        ),
        latex_source=latex_source,
    )

    # --- rows -------------------------------------------------------------
    block = 0
    rows_in_block = 0
    pending_break = False
    row_index = 0
    cells: list[Cell] = []
    max_span_sum = 0

    for segment in split_rows(body):
        content, n_full, _n_partial = _strip_leading_rules(segment)
        if n_full:
            pending_break = True
        if not content.strip():
            continue
        if pending_break and rows_in_block:
            block += 1
            rows_in_block = 0
        pending_break = False

        raw_cells = split_cells(content)
        col = 0
        for raw in raw_cells:
            inner, colspan, rowspan = _cell_spans(raw)
            is_bold, bold_source = bold_mod.detect(inner, macros)
            expanded = expand_macros(inner, macros)
            text = clean_latex(expanded)
            math_text = clean_latex(expanded, math=True)
            value, values = numbers_mod.extract(math_text)
            if len(values) > 1 and numbers_mod.looks_numeric(text):
                warnings.append(
                    f"{dom_id}/r{row_index}/c{col}: cell holds "
                    f"{len(values)} numeric values ({text}); Cell.value cannot represent "
                    "more than one, so it is left unset"
                )
            cells.append(
                Cell(
                    row=row_index,
                    col=col,
                    raw_latex=raw.strip(),
                    text=text,
                    value=value,
                    is_bold=is_bold,
                    bold_source=bold_source,
                    colspan=colspan,
                    rowspan=rowspan,
                    block=block,
                )
            )
            col += colspan
        max_span_sum = max(max_span_sum, col)
        if n_cols and col != n_cols:
            warnings.append(
                f"{dom_id}/r{row_index}: row covers {col} columns, column spec declares {n_cols}"
            )
        row_index += 1
        rows_in_block += 1

    if not n_cols:
        n_cols = max_span_sum
        warnings.append(f"{dom_id}: column count taken from row width; spec '{colspec}' unreadable")
    n_cols = max(n_cols, max_span_sum)

    # --- headers ----------------------------------------------------------
    header_rows = sorted({c.row for c in cells if c.block == 0})
    has_body = any(c.block > 0 for c in cells)
    if not has_body:
        header_rows = []
        if cells:
            warnings.append(
                f"{dom_id}: no full-width rule separates a header from the body; "
                "no row is marked as a header"
            )
    elif len(header_rows) > MAX_HEADER_ROWS:
        warnings.append(
            f"{dom_id}: {len(header_rows)} rows precede the first rule, more than the "
            f"{MAX_HEADER_ROWS} a header plausibly spans; none marked as a header"
        )
        header_rows = []
    header_set = set(header_rows)
    for cell in cells:
        cell.is_header = cell.row in header_set

    # --- columns ----------------------------------------------------------
    columns: list[Column] = []
    for j in range(n_cols):
        covering = [c for c in cells if c.is_header and c.col <= j < c.col + c.colspan]
        parts: list[str] = []
        raw_parts: list[str] = []
        for c in sorted(covering, key=lambda c: c.row):
            if c.text and (not parts or parts[-1] != c.text):
                parts.append(c.text)
            raw_parts.append(c.raw_latex)
        header = " ".join(parts)
        metric, direction, direction_source = direction_mod.resolve(" ".join(raw_parts), header)

        data = [c for c in cells if not c.is_header and c.col == j and c.colspan == 1]
        is_spacer = bool(data) and all(not c.text.strip() for c in data)

        columns.append(
            Column(
                index=j,
                header=header,
                metric=metric,
                direction=direction,
                direction_source=direction_source,
                is_spacer=is_spacer,
            )
        )

    table.columns = columns
    table.cells = cells
    table.n_rows = row_index
    table.n_cols = n_cols
    table.parse_warnings = warnings
    return table


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def parse_tables(latex: str, macros: dict[str, str] | None = None) -> list[Table]:
    """Parse every tabular in an assembled LaTeX document.

    `latex` is `SourceDocument.assembled_latex` (all `\\input`/`\\include` already
    resolved by ingest) and `macros` is `SourceDocument.macros`. Any macro
    definitions present in `latex` itself are merged in, with the supplied table
    winning, so the parser also works on a single file in isolation.
    """
    from .latexutil import collect_macros

    src = blank_comments(latex)
    merged = dict(collect_macros(src))
    merged.update({k.lstrip("\\"): v for k, v in (macros or {}).items()})
    column_types = collect_column_types(src)

    positions, discovery_warnings = _discover_positions(src)
    floats = _float_spans(src)

    tables: list[Table] = []
    seen_dom_ids: dict[str, int] = {}
    for ordinal, pos in enumerate(positions):
        span = _env_span(src, pos)
        if span is None:
            continue
        _name, colspec, body_start, body_end, env_end = span

        # Caption and label live in the enclosing float, before or after the
        # tabular depending on the paper. Fall back to a window when the float is
        # missing or unclosed (ResNet comments out an \end{table*}).
        lo, hi = max(0, pos - 1200), min(len(src), env_end + 2000)
        enclosing = [(a, b) for a, b in floats if a <= pos and env_end <= b]
        if enclosing:
            lo, hi = min(enclosing, key=lambda s: s[1] - s[0])
        # Never let a neighbouring tabular's caption leak in.
        for other in positions:
            if other == pos:
                continue
            if other < pos:
                other_span = _env_span(src, other)
                other_end = other_span[4] if other_span else other
                if lo < other_end <= pos:
                    lo = other_end
            elif lo <= other < hi:
                hi = other

        label = _nearest_command_arg(src, (lo, hi), "label", pos)
        caption_raw = _nearest_command_arg(src, (lo, hi), "caption", pos)
        caption = clean_latex(expand_macros(caption_raw or "", merged))

        # Anchors must be unique: the gutter and jump-to-anchor both key on
        # dom_id. ResNet comments out an \end{table*}, which leaves two tabulars
        # sharing one float and therefore one \label.
        dom_id = _table_dom_id(label, ordinal)
        if dom_id in seen_dom_ids:
            warnings = list(discovery_warnings)
            warnings.append(
                f"{dom_id}: a second tabular resolves to the same \\label; "
                f"anchored as {dom_id}-{seen_dom_ids[dom_id] + 1} instead"
            )
            seen_dom_ids[dom_id] += 1
            dom_id = f"{dom_id}-{seen_dom_ids[dom_id]}"
        else:
            seen_dom_ids[dom_id] = 1
            warnings = list(discovery_warnings)

        tables.append(
            _build_table(
                body=src[body_start:body_end],
                colspec=colspec,
                latex_source=src[pos:env_end],
                label=label,
                caption=caption,
                dom_id=dom_id,
                macros=merged,
                column_types=column_types,
                warnings=warnings,
            )
        )
    return tables
