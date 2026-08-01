"""Bold detection.

Bold appears in at least five forms across the corpus:

    \\textbf{41.29}                 Transformer
    \\mathbf{...}                   via \\newcommand{\\mbf}[1]{\\mathbf{#1}}
    \\boldmath$3.3\\cdot10^{18}$     Transformer, inside a \\multicolumn
    {\\bf 86.7/85.9}                BERT — a group-scoped switch, not a command
    \\hl{85.6}                      ResNet — \\renewcommand{\\hl}[1]{\\textbf{#1}}

The last one is why this cannot be a regex over the raw source: the macro table
has to be expanded first, and the reported `bold_source` has to name the macro so
a human reading the finding can see where the bold came from.
"""

from __future__ import annotations

from .latexutil import (
    clean_latex,
    expand_macros,
    macro_names_used,
    normalize_macros,
    read_cs_name,
    read_group,
    skip_ws,
)

# Commands taking an argument that is set bold.
_ARG_FORMS = {"textbf": "textbf", "mathbf": "mathbf", "boldsymbol": "mathbf", "pmb": "mathbf"}
# Switches that apply to the remainder of the enclosing group.
_SWITCH_FORMS = {"boldmath": "boldmath", "bf": "bf", "bfseries": "bf"}


def _has_content(s: str) -> bool:
    return bool(clean_latex(s).strip())


def _scan(s: str) -> tuple[bool, str | None]:
    """Find a bold construct with non-empty scope in already-expanded LaTeX."""
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            name, j = read_cs_name(s, i)
            if name in _ARG_FORMS:
                k = skip_ws(s, j)
                if k < n and s[k] == "{":
                    content, _ = read_group(s, k)
                    if _has_content(content):
                        return True, _ARG_FORMS[name]
                elif _has_content(s[k:]):
                    # \bfseries-style usage without braces.
                    return True, _ARG_FORMS[name]
            elif name in _SWITCH_FORMS:
                # A switch applies to the rest of the enclosing group. Everything
                # after it, up to the close of that group, is bold.
                if _has_content(_rest_of_group(s, j)):
                    return True, _SWITCH_FORMS[name]
            i = j
            continue
        i += 1
    return False, None


def _rest_of_group(s: str, i: int) -> str:
    """Text from `i` until the enclosing group closes (or the string ends)."""
    depth = 0
    j, n = i, len(s)
    while j < n:
        c = s[j]
        if c == "\\":
            _, j = read_cs_name(s, j)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            if depth == 0:
                return s[i:j]
            depth -= 1
        j += 1
    return s[i:n]


def detect(raw: str, macros) -> tuple[bool, str | None]:
    """Return (is_bold, bold_source).

    `bold_source` is one of `textbf`, `mathbf`, `boldmath`, `bf`, or
    `macro:<name>` when a user macro is what introduced the bold.

    `macros` is passed through to `expand_macros` unflattened, so a
    `dict[str, MacroDef]` keeps its `n_args`.
    """
    bodies = normalize_macros(macros)

    # A user macro that expands to bold is attributed to the macro, not to the
    # primitive it happens to expand into.
    for name in macro_names_used(raw, macros):
        expanded_body, _ = _scan(expand_macros(bodies[name], macros))
        if expanded_body:
            expanded_cell, _ = _scan(expand_macros(raw, macros))
            if expanded_cell:
                return True, f"macro:{name}"

    return _scan(expand_macros(raw, macros))
