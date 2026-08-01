"""Column-spec parsing.

Getting the column count wrong shifts every column index, which silently moves
every value into the wrong column. Two real hazards:

  BERT   {l@{\\extracolsep{\\fill}}cccccccc c}   the @{...} insert is not a column
  ResNet {l|x{42}|c}                            with \\newcolumntype{x}[1]{...}

Custom column types are harvested from the source so their arity is known rather
than guessed.
"""

from __future__ import annotations

import re

from .latexutil import blank_comments, read_bracket, read_group, skip_ws

# Built-in specifiers that consume no argument.
_PLAIN_COLS = set("lcrX")
# Built-in specifiers taking one `{...}` width argument.
_ARG_COLS = set("pmbw")
# Inserts and modifiers: consume their group, produce no column.
_INSERTS = set("@!><")

_NEWCOLUMNTYPE = re.compile(r"\\newcolumntype\s*\{\s*(\w)\s*\}\s*(?:\[(\d+)\])?\s*\{")


def collect_column_types(latex: str) -> dict[str, int]:
    """letter -> number of `{...}` arguments, from `\\newcolumntype` definitions."""
    src = blank_comments(latex)
    types: dict[str, int] = {}
    for m in _NEWCOLUMNTYPE.finditer(src):
        types[m.group(1)] = int(m.group(2) or 0)
    return types


def count_columns(
    spec: str, custom: dict[str, int] | None = None
) -> tuple[int, list[str]]:
    """Return (n_columns, warnings)."""
    custom = custom or {}
    warnings: list[str] = []
    n = 0
    i = 0
    length = len(spec)
    while i < length:
        c = spec[i]
        if c.isspace() or c == "|" or c == ".":
            i += 1
            continue
        if c in _INSERTS:
            i += 1
            i = skip_ws(spec, i)
            if i < length and spec[i] == "{":
                _, i = read_group(spec, i)
            continue
        if c == "*":
            i += 1
            count_arg, i = read_group(spec, skip_ws(spec, i))
            sub, i = read_group(spec, skip_ws(spec, i))
            try:
                repeat = int(count_arg.strip())
            except ValueError:
                warnings.append(f"column spec: unreadable *{{{count_arg}}} repeat count")
                continue
            sub_n, sub_w = count_columns(sub, custom)
            n += repeat * sub_n
            warnings.extend(sub_w)
            continue
        if c in custom:
            i += 1
            for _ in range(custom[c]):
                i = skip_ws(spec, i)
                if i < length and spec[i] == "{":
                    _, i = read_group(spec, i)
            n += 1
            continue
        if c in _ARG_COLS:
            i += 1
            i = skip_ws(spec, i)
            if i < length and spec[i] == "[":
                _, i = read_bracket(spec, i)
                i = skip_ws(spec, i)
            if i < length and spec[i] == "{":
                _, i = read_group(spec, i)
            n += 1
            continue
        if c in _PLAIN_COLS:
            n += 1
            i += 1
            continue
        if c.isalpha():
            # An unknown letter is a column type we have no definition for. Count
            # it as one column, consume a trailing group if it has one, and say so.
            i += 1
            j = skip_ws(spec, i)
            if j < length and spec[j] == "{":
                _, i = read_group(spec, j)
            n += 1
            warnings.append(f"column spec: unknown column type '{c}' assumed to be one column")
            continue
        i += 1
    return n, warnings
