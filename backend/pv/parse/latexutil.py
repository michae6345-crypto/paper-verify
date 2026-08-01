"""Low-level LaTeX scanning utilities shared by the table parser.

Nothing here knows about tables. Everything here is deterministic: no heuristics
that could produce a verdict, and no silent guessing. Where a construct cannot be
resolved the caller is told, and turns that into a `parse_warning`.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from pv.models import MacroDef

# --------------------------------------------------------------------------
# Comments
# --------------------------------------------------------------------------


def blank_comments(src: str) -> str:
    """Replace `%` comments with spaces, preserving length and line structure.

    Length preservation matters: TexSoup reports node offsets into the string it
    was handed, and the table parser uses those offsets against the same string.

    A commented-out `\\hline` inside a tabular would otherwise create a phantom
    block boundary — the Transformer fixture contains exactly that.
    """
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "\\":
            # Any escaped char, including \% and \\, is not a comment start.
            i += 2
            continue
        if c == "%":
            j = i
            while j < n and src[j] != "\n":
                out[j] = " "
                j += 1
            i = j
            continue
        i += 1
    return "".join(out)


# --------------------------------------------------------------------------
# Group / argument reading
# --------------------------------------------------------------------------


def read_group(s: str, i: int) -> tuple[str, int]:
    """Read a balanced `{...}` starting at `i`. Returns (content, index_after).

    If `s[i]` is not `{`, returns ("", i) — the caller decides what that means.
    """
    if i >= len(s) or s[i] != "{":
        return "", i
    depth = 0
    j = i
    n = len(s)
    while j < n:
        c = s[j]
        if c == "\\":
            j += 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1 : j], j + 1
        j += 1
    # Unbalanced.
    return s[i + 1 :], n


def read_bracket(s: str, i: int) -> tuple[str, int]:
    """Read a balanced `[...]` optional argument starting at `i`."""
    if i >= len(s) or s[i] != "[":
        return "", i
    depth = 0
    j = i
    n = len(s)
    while j < n:
        c = s[j]
        if c == "\\":
            j += 2
            continue
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return s[i + 1 : j], j + 1
        j += 1
    return s[i + 1 :], n


def read_paren(s: str, i: int) -> tuple[str, int]:
    if i >= len(s) or s[i] != "(":
        return "", i
    j = s.find(")", i)
    if j < 0:
        return s[i + 1 :], len(s)
    return s[i + 1 : j], j + 1


def skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t\r\n":
        i += 1
    return i


def read_cs_name(s: str, i: int) -> tuple[str, int]:
    """`s[i]` is `\\`. Return (name, index_after). Single-char control symbols
    (`\\&`, `\\%`) come back as their one character."""
    j = i + 1
    if j < len(s) and s[j].isalpha():
        while j < len(s) and s[j].isalpha():
            j += 1
        return s[i + 1 : j], j
    if j < len(s):
        return s[j], j + 1
    return "", j


# --------------------------------------------------------------------------
# Structural scanner
# --------------------------------------------------------------------------

Atom = tuple[str, int, int, int, int, int]  # kind, start, end, brace, math, env


def iter_atoms(s: str) -> Iterator[Atom]:
    """Walk `s`, yielding the atoms a table parser needs to split on, each tagged
    with the brace depth, math depth and environment depth it occurs at.

    Kinds: `rowbreak` (`\\\\`, including `\\\\*` and `\\\\[2pt]`), `amp` (`&`),
    `cs` (any control sequence). Escaped `\\&` never yields `amp`, and `&` inside
    `$...$` or a nested environment is reported at non-zero depth so the caller
    can ignore it.
    """
    i, n = 0, len(s)
    brace = math = env = 0
    while i < n:
        c = s[i]
        if c == "\\":
            if i + 1 < n and s[i + 1] == "\\":
                j = i + 2
                if j < n and s[j] == "*":
                    j += 1
                k = skip_ws(s, j)
                if k < n and s[k] == "[":
                    _, j = read_bracket(s, k)
                yield ("rowbreak", i, j, brace, math, env)
                i = j
                continue
            name, j = read_cs_name(s, i)
            if name == "begin":
                env += 1
            elif name == "end":
                env -= 1
            elif name in ("(", "["):
                math += 1
            elif name in (")", "]"):
                math = max(0, math - 1)
            yield ("cs", i, j, brace, math, env)
            i = j
            continue
        if c == "{":
            brace += 1
            i += 1
            continue
        if c == "}":
            brace -= 1
            i += 1
            continue
        if c == "$":
            if i + 1 < n and s[i + 1] == "$":
                math = 0 if math else 2
                i += 2
                continue
            math = 0 if math else 1
            i += 1
            continue
        if c == "&":
            yield ("amp", i, i + 1, brace, math, env)
            i += 1
            continue
        i += 1


def split_rows(body: str) -> list[str]:
    """Split on top-level `\\\\` only — never inside braces, math, or a nested
    environment such as an inner `tabular` or `array`."""
    parts, last = [], 0
    for kind, a, b, brace, math, env in iter_atoms(body):
        if kind == "rowbreak" and brace == 0 and math == 0 and env == 0:
            parts.append(body[last:a])
            last = b
    parts.append(body[last:])
    return parts


def split_cells(row: str) -> list[str]:
    """Split a row on top-level `&`. `\\&` is a control symbol, not a separator."""
    parts, last = [], 0
    for kind, a, b, brace, math, env in iter_atoms(row):
        if kind == "amp" and brace == 0 and math == 0 and env == 0:
            parts.append(row[last:a])
            last = b
    parts.append(row[last:])
    return parts


# --------------------------------------------------------------------------
# Macros
# --------------------------------------------------------------------------

_NEWCOMMAND = re.compile(
    r"\\(?:re)?newcommand\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*"
    r"(?:\[(\d+)\])?\s*(?:\[[^\]]*\])?\s*\{"
)
_DEF = re.compile(r"\\def\s*\\([A-Za-z@]+)\s*\{")


_PARAM = re.compile(r"(?<!#)#(\d)")


def _arity(body: str) -> int:
    nums = [int(x) for x in _PARAM.findall(body)]
    return max(nums) if nums else 0


def collect_macros(latex: str) -> dict[str, str]:
    """Harvest `\\newcommand` / `\\renewcommand` / `\\def` bodies from source.

    Agent A's ingest stage supplies `SourceDocument.macros`; this exists so the
    parser can stand alone (and so tests can read fixture files directly).
    Later definitions win, matching LaTeX's own behaviour for `\\renewcommand`.
    """
    return {name: d.body for name, d in collect_macro_defs(latex).items()}


def macro_body_spans(latex: str) -> list[tuple[int, int]]:
    """Character spans of every macro definition body in `blank_comments(latex)`.

    A `\\begin{tabular}` inside one of these is a template, not a table: ResNet
    defines `\\newcommand{\\tabincell}[2]{\\begin{tabular}{@{}#1@{}}#2\\end{tabular}}`,
    whose "cells" are `#1` and `#2`.
    """
    src = blank_comments(latex)
    spans: list[tuple[int, int]] = []
    for pattern in (_NEWCOMMAND, _DEF):
        for m in pattern.finditer(src):
            _, end = read_group(src, m.end() - 1)
            spans.append((m.start(), end))
    return spans


def collect_macro_defs(latex: str) -> dict[str, MacroDef]:
    """As `collect_macros`, but keeping the declared argument count.

    `\\newcommand{\\x}[1]{...}` that never writes `#1` in its body still consumes
    an argument, and inferring arity from the body would miss that.
    """
    src = blank_comments(latex)
    defs: dict[str, MacroDef] = {}
    for m in _NEWCOMMAND.finditer(src):
        name = m.group(1) or m.group(2)
        body, _ = read_group(src, m.end() - 1)
        declared = int(m.group(3)) if m.group(3) else _arity(body)
        defs[name] = MacroDef(name=name, body=body, n_args=declared)
    for m in _DEF.finditer(src):
        name = m.group(1)
        if name in defs:
            continue
        body, _ = read_group(src, m.end() - 1)
        defs[name] = MacroDef(name=name, body=body, n_args=_arity(body))
    return defs


def normalize_macros(macros) -> dict[str, str]:
    """name -> body, accepting either a flat `dict[str, str]` or ingest's
    authoritative `dict[str, MacroDef]` (which also carries `n_args`)."""
    if not macros:
        return {}
    out: dict[str, str] = {}
    for key, entry in macros.items():
        name = key.lstrip("\\")
        if not name:
            continue
        out[name] = entry if isinstance(entry, str) else entry.body
    return out


def macro_arities(macros) -> dict[str, int]:
    """Argument counts. Taken from `MacroDef.n_args` when ingest supplied it, and
    otherwise inferred from the highest `#n` in the body — which undercounts a
    macro that declares an argument it never uses."""
    if not macros:
        return {}
    out: dict[str, int] = {}
    for key, entry in macros.items():
        name = key.lstrip("\\")
        if not name:
            continue
        out[name] = _arity(entry) if isinstance(entry, str) else entry.n_args
    return out


def expand_macros(s: str, macros, max_depth: int = 8) -> str:
    """Expand user macros, arguments and all. Bounded, so a self-referential
    definition cannot hang the parser."""
    table = normalize_macros(macros)
    if not table:
        return s
    arity = macro_arities(macros)
    for _ in range(max_depth):
        out: list[str] = []
        i, n = 0, len(s)
        changed = False
        while i < n:
            c = s[i]
            if c == "\\" and i + 1 < n and s[i + 1].isalpha():
                name, j = read_cs_name(s, i)
                if name in table:
                    k = j
                    args: list[str] = []
                    ok = True
                    for _a in range(arity[name]):
                        k = skip_ws(s, k)
                        if k < n and s[k] == "{":
                            arg, k = read_group(s, k)
                            args.append(arg)
                        elif k < n:
                            args.append(s[k])
                            k += 1
                        else:
                            ok = False
                            break
                    if ok:
                        body = table[name]
                        for idx, arg in enumerate(args, 1):
                            body = body.replace(f"#{idx}", arg)
                        out.append(body)
                        i = k
                        changed = True
                        continue
                out.append(s[i:j])
                i = j
                continue
            out.append(c)
            i += 1
        s = "".join(out)
        if not changed:
            break
    return s


def macro_names_used(s: str, macros: dict[str, str] | None) -> list[str]:
    """User-macro names invoked in `s`, in source order."""
    table = normalize_macros(macros)
    if not table:
        return []
    found: list[str] = []
    i, n = 0, len(s)
    while i < n:
        if s[i] == "\\":
            name, j = read_cs_name(s, i)
            if name in table and name not in found:
                found.append(name)
            i = j
            continue
        i += 1
    return found


# --------------------------------------------------------------------------
# Cleaning
# --------------------------------------------------------------------------

# Commands whose arguments are dropped along with the command. Values are
# (n_required_args,). Optional [..] args are consumed generically.
DROP_WITH_ARGS: dict[str, int] = {
    "label": 1,
    "cite": 1,
    "citep": 1,
    "citet": 1,
    "citealp": 1,
    "citealt": 1,
    "citeauthor": 1,
    "citeyear": 1,
    "newcite": 1,
    "ref": 1,
    "eqref": 1,
    "autoref": 1,
    "pageref": 1,
    "footnote": 1,
    "footnotemark": 0,
    "footnotetext": 1,
    "rule": 2,
    "vspace": 1,
    "hspace": 1,
    "vskip": 0,
    "hskip": 0,
    "phantom": 1,
    "hphantom": 1,
    "vphantom": 1,
    "textcolor": 2,
    "cellcolor": 1,
    "rowcolor": 1,
    "colorbox": 2,
    "specialrule": 3,
    "cmidrule": 1,
    "cline": 1,
    "caption": 1,
    "setlength": 2,
    "arraystretch": 0,
    "extracolsep": 1,
    "selectfont": 0,
    "fontsize": 2,
    "todo": 1,
    "marginpar": 1,
    "index": 1,
}

# Commands replaced by their (single) argument.
UNWRAP: set[str] = {
    "textbf",
    "mathbf",
    "boldsymbol",
    "pmb",
    "textit",
    "textrm",
    "textsf",
    "texttt",
    "textsc",
    "textnormal",
    "emph",
    "text",
    "mathrm",
    "mathit",
    "mathcal",
    "mathbb",
    "mathsf",
    "mathtt",
    "operatorname",
    "mbox",
    "hbox",
    "ensuremath",
    "underline",
    "uline",
    "makebox",
    "scalebox",
    "resizebox",
    "raisebox",
    "url",
    "href",
}

# Zero-argument switches and spacing junk that simply vanish.
DROP_NOARG: set[str] = {
    "bf",
    "bfseries",
    "boldmath",
    "unboldmath",
    "it",
    "itshape",
    "sl",
    "sc",
    "scshape",
    "rm",
    "rmfamily",
    "sf",
    "sffamily",
    "tt",
    "ttfamily",
    "em",
    "normalfont",
    "tiny",
    "scriptsize",
    "footnotesize",
    "small",
    "normalsize",
    "large",
    "Large",
    "LARGE",
    "huge",
    "Huge",
    "centering",
    "raggedright",
    "raggedleft",
    "noindent",
    "hfill",
    "vfill",
    "hline",
    "toprule",
    "midrule",
    "bottomrule",
    "hdashline",
    "addlinespace",
    "strut",
    "displaystyle",
    "textstyle",
    "scriptstyle",
    "protect",
    "relax",
    "ignorespaces",
    "xspace",
    "quad",
    "qquad",
    "smallskip",
    "medskip",
    "bigskip",
    "fill",
    "nobreakspace",
    "leavevmode",
}

SYMBOLS: dict[str, str] = {
    "%": "%",
    "&": "&",
    "$": "$",
    "_": "_",
    "#": "#",
    "{": "{",
    "}": "}",
    ",": " ",
    ";": " ",
    ":": " ",
    "!": "",
    " ": " ",
    "-": "",
    "/": "",
    "pm": "±",
    "times": "×",
    "cdot": "·",
    "sim": "~",
    "approx": "≈",
    "leq": "≤",
    "geq": "≥",
    "pi": "π",
    "alpha": "α",
    "beta": "β",
    "epsilon": "ε",
    "uparrow": "↑",
    "downarrow": "↓",
    "rightarrow": "→",
    "to": "→",
    "textasciitilde": "~",
    "ldots": "...",
    "dots": "...",
}

# Kept verbatim in the "math" flavour so the number scanner can see them.
_MATH_KEEP = {"cdot", "times", "pm"}


def clean_latex(s: str, *, math: bool = False) -> str:
    """Strip LaTeX down to readable text.

    `math=False` gives display text for `Cell.text`. `math=True` keeps `\\cdot`,
    `\\times` and `^{...}` intact so `numbers.extract` can recognise scientific
    notation; it is never shown to a user.
    """
    out: list[str] = []
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            name, j = read_cs_name(s, i)
            # TeX discards the whitespace following a control word. Honouring
            # that is what turns `BERT$_{\small \textsc{BASE}}$` into
            # "BERT_BASE" rather than "BERT_ BASE".
            j_ws = skip_ws(s, j) if name.isalpha() else j
            if name == "begin" or name == "end":
                j = skip_ws(s, j)
                _, j = read_group(s, j)
                i = j
                continue
            if name in DROP_WITH_ARGS:
                k = j
                for _ in range(DROP_WITH_ARGS[name]):
                    k = skip_ws(s, k)
                    while k < n and s[k] in "[(":
                        if s[k] == "[":
                            _, k = read_bracket(s, k)
                        else:
                            _, k = read_paren(s, k)
                        k = skip_ws(s, k)
                    if k < n and s[k] == "{":
                        _, k = read_group(s, k)
                    else:
                        break
                i = k
                continue
            if name in ("multicolumn", "multirow"):
                # Keep only the content argument; span handling happens earlier.
                k = skip_ws(s, j)
                _, k = read_group(s, k)
                k = skip_ws(s, k)
                while k < n and s[k] == "[":
                    _, k = read_bracket(s, k)
                    k = skip_ws(s, k)
                _, k = read_group(s, k)
                k = skip_ws(s, k)
                while k < n and s[k] == "[":
                    _, k = read_bracket(s, k)
                    k = skip_ws(s, k)
                content, k = read_group(s, k)
                out.append(clean_latex(content, math=math))
                i = k
                continue
            if name in UNWRAP:
                k = skip_ws(s, j)
                while k < n and s[k] == "[":
                    _, k = read_bracket(s, k)
                    k = skip_ws(s, k)
                if k < n and s[k] == "{":
                    content, k = read_group(s, k)
                    out.append(clean_latex(content, math=math))
                    i = k
                    continue
                i = j_ws
                continue
            if math and name in _MATH_KEEP:
                out.append("\\" + name)
                i = j_ws
                continue
            if name in SYMBOLS:
                out.append(SYMBOLS[name])
                i = j_ws
                continue
            if name in DROP_NOARG:
                i = j_ws
                continue
            # Unknown command: drop the command, keep whatever follows.
            i = j_ws
            continue
        if c in "{}":
            i += 1
            continue
        if c == "$":
            i += 1
            continue
        if c == "~":
            out.append(" ")
            i += 1
            continue
        if c == "^":
            out.append("^")
            i += 1
            continue
        out.append(c)
        i += 1
    text = "".join(out)
    text = text.replace("``", '"').replace("''", '"')
    return re.sub(r"\s+", " ", text).strip()
