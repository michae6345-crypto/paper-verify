"""Title and abstract extraction from assembled LaTeX.

Both are returned as readable prose, not LaTeX: macros expanded, comments and
footnote apparatus removed, whitespace collapsed. Numbers are left untouched —
the abstract is where check 4 reads its claims from, so `41.8` must survive
verbatim.
"""

from __future__ import annotations

import re

from .latexutil import mask_comments, read_group, read_optional, skip_space
from .macros import Macro, expand

# In preference order. `\title` first, then the conference-style aliases;
# `\icmltitlerunning` is a short form and only used if nothing else matched.
_TITLE_COMMANDS = (
    "title",
    "icmltitle",
    "papertitle",
    "TITLE",
    "icmltitlerunning",
)

# Spacing commands that must vanish without leaving a space behind, or the
# result reads "BERT , which" — `\bert` is defined as `BERT\xspace`.
_ZERO_WIDTH = ("xspace", "protect", "allowbreak", "linebreak", "noindent")

# `\%`, `\&` and friends are literal characters, not commands.
_ESCAPED_SPECIALS = "%&_#$~^{}"

# Commands whose *content* is not part of the sentence.
_DROP_WITH_ARG = (
    "thanks",
    "footnote",
    "footnotemark",
    "label",
    "vspace",
    "hspace",
    "textsuperscript",
    "affiliation",
    "institute",
)
# Commands that vanish, leaving their argument in place.
_UNWRAP = (
    "text",
    "textbf",
    "textit",
    "textrm",
    "texttt",
    "emph",
    "mathbf",
    "mathrm",
    "mbox",
    "protect",
    "textsc",
)


def extract_title(latex: str, macros: dict[str, Macro] | None = None) -> str:
    """The paper title, macro-expanded.

    Conference styles rename the command: CLIP uses `\\icmltitle`, and nothing
    in that paper ever calls `\\title`.
    """
    for command in _TITLE_COMMANDS:
        body = _argument_of(latex, command)
        if body is not None:
            title = clean_text(body, macros)
            if title:
                return title
    return ""


def extract_abstract(latex: str, macros: dict[str, Macro] | None = None) -> str:
    masked = mask_comments(latex)
    m = re.search(r"\\begin\s*\{abstract\}", masked)
    if m is not None:
        end = masked.find("\\end{abstract}", m.end())
        if end == -1:
            end = len(latex)
        return clean_text(latex[m.end() : end], macros)
    body = _argument_of(latex, "abstract")
    if body is not None:
        return clean_text(body, macros)
    return ""


def _argument_of(latex: str, command: str) -> str | None:
    """The braced argument of `\\command`, skipping an optional `[short]` form."""
    masked = mask_comments(latex)
    for m in re.finditer(r"\\" + command + r"(?![a-zA-Z])", masked):
        i = skip_space(masked, m.end())
        _, i = read_optional(masked, i)
        i = skip_space(masked, i)
        if i < len(latex) and latex[i] == "{":
            body, _ = read_group(latex, i)
            return body
    return None


def clean_text(latex: str, macros: dict[str, Macro] | None = None) -> str:
    """Turn a fragment of LaTeX into the sentence a reader would see."""
    text = mask_comments(latex, fill="")
    if macros:
        text = expand(text, macros)

    for name in _ZERO_WIDTH:
        # No trailing `\s*`: `\bert` is defined as `BERT\xspace`, and eating the
        # space after `\xspace` would produce "BERTis designed".
        text = re.sub(r"\\" + name + r"(?![a-zA-Z])", "", text)
    for name in _DROP_WITH_ARG:
        text = _remove_command(text, name, keep_arg=False)
    for name in _UNWRAP:
        text = _remove_command(text, name, keep_arg=True)

    # Escaped specials are literal characters, not markup: "80.5\%" is a number
    # the abstract-vs-table check will read. Park them while markup is stripped.
    for i, ch in enumerate(_ESCAPED_SPECIALS):
        text = text.replace("\\" + ch, f"\x00{i}\x00")

    text = re.sub(r"\\(cite|citep|citet|ref|eqref|autoref)\s*\*?(\[[^\]]*\])*\{[^}]*\}", "", text)
    text = re.sub(r"\\(?:maketitle|newpage|clearpage|centering|par|noindent|\\)(?![a-zA-Z])", " ", text)
    text = re.sub(r"\\begin\s*\{[^}]*\}|\\end\s*\{[^}]*\}", " ", text)
    text = re.sub(r"\\[a-zA-Z]+\s*\*?", " ", text)
    text = text.replace("~", " ")
    text = re.sub(r"[{}$]", "", text)
    text = re.sub(r"``|''", '"', text)
    text = re.sub(r"\s+", " ", text)
    # Removed commands leave gaps in front of punctuation.
    text = re.sub(r"\s+([,.;:!?%)\]])", r"\1", text)
    text = re.sub(r"([(\[])\s+", r"\1", text)
    for i, ch in enumerate(_ESCAPED_SPECIALS):
        text = text.replace(f"\x00{i}\x00", ch)
    return text.strip()


def _remove_command(text: str, name: str, keep_arg: bool) -> str:
    pattern = re.compile(r"\\" + name + r"(?![a-zA-Z])\s*\*?")
    out = text
    while True:
        m = pattern.search(out)
        if m is None:
            return out
        i = skip_space(out, m.end())
        _, i = read_optional(out, i)
        i = skip_space(out, i)
        if i < len(out) and out[i] == "{":
            arg, after = read_group(out, i)
            replacement = arg if keep_arg else ""
            out = out[: m.start()] + replacement + out[after:]
        else:
            out = out[: m.start()] + out[m.end() :]
