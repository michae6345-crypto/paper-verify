"""Small LaTeX lexical helpers shared by the ingest modules.

Nothing here parses semantics — that is the table parser's job. These functions
only deal with the two things every ingest step needs: knowing where a comment
starts, and reading a balanced `{...}` group.
"""

from __future__ import annotations

CONTROL_WORD_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")


def is_escaped(text: str, index: int) -> bool:
    """True when the character at `index` is preceded by an odd number of backslashes."""
    n = 0
    i = index - 1
    while i >= 0 and text[i] == "\\":
        n += 1
        i -= 1
    return n % 2 == 1


def mask_comments(text: str, fill: str = " ") -> str:
    """Blank out `%` comments, preserving length so offsets stay comparable.

    Character offsets into the returned string are identical to offsets into the
    input, which is what lets us search a comment-free view of the document and
    still report positions that are valid in `assembled_latex`.
    """
    out = list(text)
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "%" and not is_escaped(text, i):
            j = i
            while j < n and text[j] != "\n":
                out[j] = fill
                j += 1
            i = j
        else:
            i += 1
    return "".join(out)


def strip_comment_lines(text: str) -> str:
    """Drop comment text outright. Only for content we are about to normalise
    into prose (title, abstract) — never for `assembled_latex`."""
    lines = []
    for line in mask_comments(text, fill="\x00").split("\n"):
        line = line.replace("\x00", "")
        lines.append(line)
    return "\n".join(lines)


def read_group(text: str, index: int) -> tuple[str, int]:
    """Read a balanced `{...}` group starting at `index` (which must be `{`).

    Returns (contents_without_braces, index_after_closing_brace). If the braces
    never close, returns everything to the end of the string.
    """
    if index >= len(text) or text[index] != "{":
        raise ValueError(f"expected '{{' at {index}")
    depth = 0
    i = index
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[index + 1 : i], i + 1
        i += 1
    return text[index + 1 :], n


def read_optional(text: str, index: int) -> tuple[str | None, int]:
    """Read a `[...]` optional argument at `index`, if one is there."""
    if index >= len(text) or text[index] != "[":
        return None, index
    depth = 0
    i = index
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[index + 1 : i], i + 1
        i += 1
    return None, index


def skip_space(text: str, index: int) -> int:
    while index < len(text) and text[index] in " \t\n\r":
        index += 1
    return index


def read_control_name(text: str, index: int) -> tuple[str | None, int]:
    """Read a control sequence at `index` (which must be `\\`).

    Returns (name_without_backslash, index_after). Handles both control words
    (`\\dmodel`) and single-character control symbols (`\\%`).
    """
    if index >= len(text) or text[index] != "\\":
        return None, index
    i = index + 1
    if i >= len(text):
        return None, index
    if text[i] not in CONTROL_WORD_CHARS:
        return text[i], i + 1
    j = i
    while j < len(text) and text[j] in CONTROL_WORD_CHARS:
        j += 1
    return text[i:j], j
