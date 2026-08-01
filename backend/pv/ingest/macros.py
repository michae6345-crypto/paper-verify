"""Macro table construction and expansion.

Bold detection downstream depends entirely on this. The Transformer fixture
defines `\\newcommand{\\mbf}[1]{\\mathbf{#1}}` and then bolds table cells with
`\\mbf{...}` — a regex for `\\textbf` sees nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .latexutil import (
    mask_comments,
    read_control_name,
    read_group,
    read_optional,
    skip_space,
)

# Definitions we refuse to expand: expanding them would corrupt the document
# rather than clarify it.
_SKIP_NAMES = {"\\", "@"}

_DEF_FORMS = ("newcommand", "renewcommand", "providecommand", "DeclareRobustCommand")


@dataclass(frozen=True)
class Macro:
    """One user-defined command."""

    name: str  # without the leading backslash
    n_args: int
    body: str
    # Default value for the first argument, when defined as \newcommand{\x}[1][d]{...}
    optional_default: str | None = None
    # newcommand | renewcommand | providecommand | DeclareRobustCommand | def
    kind: str = "newcommand"

    @property
    def token(self) -> str:
        return "\\" + self.name


def extract_macros(latex: str) -> dict[str, Macro]:
    """Collect every macro definition in `latex`, keyed by name (no backslash).

    Later definitions win, which mirrors TeX: `\\renewcommand` after
    `\\newcommand` replaces it. Commented-out definitions are ignored — the
    fixture has half a dozen of those.
    """
    text = mask_comments(latex)
    macros: dict[str, Macro] = {}

    i = 0
    n = len(text)
    while i < n:
        pos = text.find("\\", i)
        if pos == -1:
            break
        name, after = read_control_name(text, pos)
        if name is None:
            i = pos + 1
            continue
        if name in _DEF_FORMS:
            macro = _parse_newcommand(text, after, kind=name)
            if macro is not None:
                macros[macro.name] = macro
            i = after
            continue
        if name == "def":
            macro = _parse_def(text, after)
            if macro is not None:
                macros[macro.name] = macro
            i = after
            continue
        i = after
    return macros


def _parse_newcommand(text: str, index: int, kind: str) -> Macro | None:
    i = index
    if i < len(text) and text[i] == "*":  # \newcommand*
        i += 1
    i = skip_space(text, i)
    if i >= len(text):
        return None

    # The name comes either braced -- \newcommand{\mbf} -- or bare -- \newcommand\mc.
    if text[i] == "{":
        inner, i = read_group(text, i)
        inner = inner.strip()
        if not inner.startswith("\\"):
            return None
        name = inner[1:]
    elif text[i] == "\\":
        name, i = read_control_name(text, i)
        if name is None:
            return None
    else:
        return None

    if not name or name in _SKIP_NAMES:
        return None

    i = skip_space(text, i)
    n_args = 0
    optional_default: str | None = None
    arg_spec, j = read_optional(text, i)
    if arg_spec is not None:
        i = j
        try:
            n_args = int(arg_spec.strip())
        except ValueError:
            return None
        i = skip_space(text, i)
        optional_default, j = read_optional(text, i)
        if optional_default is not None:
            i = j
            i = skip_space(text, i)

    if i >= len(text) or text[i] != "{":
        return None
    body, _ = read_group(text, i)
    return Macro(
        name=name,
        n_args=n_args,
        body=body,
        optional_default=optional_default,
        kind=kind,
    )


def _parse_def(text: str, index: int) -> Macro | None:
    i = skip_space(text, index)
    if i >= len(text) or text[i] != "\\":
        return None
    name, i = read_control_name(text, i)
    if not name or name in _SKIP_NAMES:
        return None

    # Parameter text runs up to the opening brace. We only support the plain
    # #1#2... form; delimited parameters are recorded but never expanded.
    start = i
    while i < len(text) and text[i] != "{":
        if text[i] == "\\":
            return None  # too exotic to expand safely
        i += 1
    if i >= len(text):
        return None
    param_text = text[start:i]
    n_args = len(re.findall(r"#\d", param_text))
    if param_text.strip() and re.sub(r"#\d", "", param_text).strip():
        return None  # delimited parameters — not expandable here
    body, _ = read_group(text, i)
    return Macro(name=name, n_args=n_args, body=body, kind="def")


def macro_table(macros: dict[str, Macro]) -> dict[str, str]:
    """Flatten to the `SourceDocument.macros` shape: name -> expansion body.

    Keys carry the leading backslash so consumers can match on the token they
    actually see in the source.
    """
    return {m.token: m.body for m in macros.values()}


def substitute(macro: Macro, args: list[str]) -> str:
    """Fill `#1..#9` in a macro body with `args`."""
    out: list[str] = []
    body = macro.body
    i = 0
    while i < len(body):
        ch = body[i]
        if ch == "#" and i + 1 < len(body):
            nxt = body[i + 1]
            if nxt == "#":
                out.append("#")
                i += 2
                continue
            if nxt.isdigit() and nxt != "0":
                k = int(nxt) - 1
                out.append(args[k] if k < len(args) else "")
                i += 2
                continue
        if ch == "\\" and i + 1 < len(body):
            out.append(body[i : i + 2])
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def expand(text: str, macros: dict[str, Macro], max_passes: int = 8) -> str:
    """Expand every known macro in `text`, repeatedly, until it stops changing.

    Arguments are read as balanced groups, so `\\mbf{41.8}` becomes
    `\\mathbf{41.8}` and nested calls resolve. Unknown commands are left alone.
    `max_passes` bounds mutually recursive definitions.
    """
    if not macros:
        return text
    for _ in range(max_passes):
        expanded, changed = _expand_once(text, macros)
        text = expanded
        if not changed:
            break
    return text


def _expand_once(text: str, macros: dict[str, Macro]) -> tuple[str, bool]:
    out: list[str] = []
    i = 0
    n = len(text)
    changed = False
    while i < n:
        ch = text[i]
        if ch != "\\":
            out.append(ch)
            i += 1
            continue
        name, after = read_control_name(text, i)
        macro = macros.get(name) if name else None
        if macro is None:
            # Not ours — copy the token through verbatim.
            out.append(text[i:after] if name else ch)
            i = after if name else i + 1
            continue

        j = after
        args: list[str] = []
        n_args = macro.n_args
        if n_args and macro.optional_default is not None:
            opt, j2 = read_optional(text, skip_space(text, j))
            if opt is not None:
                args.append(opt)
                j = j2
            else:
                args.append(macro.optional_default)
            n_args -= 1
        for _ in range(n_args):
            k = skip_space(text, j)
            if k < len(text) and text[k] == "{":
                arg, j = read_group(text, k)
                args.append(arg)
            elif k < len(text) and text[k] == "\\":
                tok, j = read_control_name(text, k)
                args.append("\\" + (tok or ""))
            elif k < len(text):
                args.append(text[k])
                j = k + 1
            else:
                args.append("")
        out.append(substitute(macro, args))
        i = j
        changed = True
    return "".join(out), changed
