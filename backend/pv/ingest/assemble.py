"""Resolve a multi-file LaTeX source tree into one string.

The fixture paper is eight `.tex` files joined by `\\input`, and its second table
uses macros defined in the main file, so nothing can be parsed until the tree is
flattened and the macro table is built.

Offsets matter. `Anchor.char_start/char_end` index into the string this module
returns, so the substitution is done in place: the `\\input{x}` token is replaced
by the file's text and everything else is copied verbatim. `Segment` records
which region of the assembled string came from which file, so a finding can be
reported against the file a human would open.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Mapping

from .latexutil import mask_comments, read_group, skip_space

_INPUT_RE = re.compile(r"\\(input|include|subfile)(?![a-zA-Z])")
_BARE_ARG_RE = re.compile(r"[\w./-]+")
_TEX_ROOT_RE = re.compile(r"%\s*!\s*TEX\s+root\s*=\s*([^\s%]+)", re.I)

# Extensions tried when \input{x} names no extension.
_CANDIDATE_SUFFIXES = ("", ".tex", ".TEX", ".sty", ".ltx")


@dataclass
class Segment:
    """A run of the assembled string that came from one file."""

    file_name: str
    start: int
    end: int


@dataclass
class AssembledSource:
    text: str
    main_file: str
    file_names: list[str] = field(default_factory=list)
    segments: list[Segment] = field(default_factory=list)
    # Files referenced by \input but absent from the source tree.
    missing_inputs: list[str] = field(default_factory=list)

    def file_at(self, offset: int) -> str | None:
        """Which source file a character offset in `text` came from.

        Segments nest — an \\input'ed file's span sits inside its parent's — so
        the narrowest containing span is the file a human would open.
        """
        best: Segment | None = None
        for seg in self.segments:
            if seg.start <= offset < seg.end:
                if best is None or (seg.end - seg.start) < (best.end - best.start):
                    best = seg
        return best.file_name if best else None


def normalize_name(name: str) -> str:
    return name.replace("\\", "/").lstrip("./").strip()


def _tex_root_hints(files: Mapping[str, str]) -> list[str]:
    """Files named by a `%!TEX root=...` magic comment.

    Several papers in the corpus carry these. They are a hint used to break a
    tie, never a requirement — a file can name a root that is not in the
    tarball at all (DenseNet's `caption.tex` points at `../main.tex`).
    """
    hints: list[str] = []
    for name, content in files.items():
        m = _TEX_ROOT_RE.search(content)
        if m is None:
            continue
        target = _resolve_target(m.group(1), files, name)
        if target is not None and target not in hints:
            hints.append(target)
    return hints


def find_main_file(files: Mapping[str, str]) -> str | None:
    """The file containing an uncommented `\\documentclass`.

    Tarballs contain `.tex` files that are not part of the document — DenseNet
    ships `office-31.tex` and `svn-mnist.tex`, leftovers from another paper that
    nothing ever `\\input`s. So the document is defined as "the main file plus
    what it reaches", never as "every .tex in the directory".

    Ties are broken by a `%!TEX root` hint, then the shallowest path, then the
    shortest name.
    """
    files = {normalize_name(k): v for k, v in files.items()}
    candidates: list[str] = []
    for name, content in files.items():
        if not name.lower().endswith((".tex", ".ltx")):
            continue
        if "\\documentclass" in mask_comments(content):
            candidates.append(name)
    if not candidates:
        return None
    hints = set(_tex_root_hints(files))
    candidates.sort(key=lambda n: (n not in hints, n.count("/"), len(n), n))
    return candidates[0]


def _resolve_target(raw: str, files: Mapping[str, str], base: str) -> str | None:
    """Map an `\\input` argument onto a key of `files`."""
    target = normalize_name(raw)
    if not target:
        return None
    base_dir = base.rsplit("/", 1)[0] if "/" in base else ""
    prefixes = [""]
    if base_dir:
        prefixes.insert(0, base_dir + "/")
    for prefix in prefixes:
        for suffix in _CANDIDATE_SUFFIXES:
            key = normalize_name(prefix + target + suffix)
            if key in files:
                return key
    # Last resort: match on basename, which covers sources that \input from a
    # directory that got flattened during extraction.
    tail = target.rsplit("/", 1)[-1]
    for suffix in _CANDIDATE_SUFFIXES:
        want = (tail + suffix).lower()
        for key in files:
            if key.rsplit("/", 1)[-1].lower() == want:
                return key
    return None


def assemble(files: Mapping[str, str], main_file: str | None = None) -> AssembledSource:
    """Flatten `files` (relative name -> content) into one LaTeX string.

    `\\input`, `\\include` and `\\subfile` are resolved recursively, with and
    without a `.tex` extension. A file already on the current include stack is
    left as its literal `\\input{...}` token rather than recursed into, so a
    cycle cannot hang the run.
    """
    files = {normalize_name(k): v for k, v in files.items()}
    main = main_file or find_main_file(files)
    if main is None:
        raise ValueError("no file containing \\documentclass; cannot assemble")
    main = normalize_name(main)
    if main not in files:
        raise ValueError(f"main file {main!r} not present in source tree")

    out: list[str] = []
    consumed: list[str] = []
    segments: list[Segment] = []
    missing: list[str] = []
    cursor = 0

    def emit(chunk: str) -> None:
        nonlocal cursor
        out.append(chunk)
        cursor += len(chunk)

    def walk(name: str, stack: tuple[str, ...]) -> None:
        content = files[name]
        if name not in consumed:
            consumed.append(name)
        start = cursor
        masked = mask_comments(content)
        i = 0
        for m in _INPUT_RE.finditer(masked):
            if m.start() < i:
                continue
            # Copy everything up to the \input verbatim.
            emit(content[i : m.start()])
            arg_at = skip_space(masked, m.end())
            if arg_at < len(masked) and masked[arg_at] == "{":
                raw, end = read_group(content, arg_at)
            else:
                tail = _BARE_ARG_RE.match(masked, arg_at)
                if tail is None:
                    emit(content[m.start() : m.end()])
                    i = m.end()
                    continue
                raw = tail.group(0)
                end = tail.end()
            target = _resolve_target(raw, files, name)
            if target is None:
                if raw not in missing:
                    missing.append(raw)
                emit(content[m.start() : end])
            elif target in stack or target == name:
                emit(content[m.start() : end])  # cycle — leave the token alone
            else:
                emit("\n")
                walk(target, stack + (name,))
                emit("\n")
            i = end
        emit(content[i:])
        segments.append(Segment(file_name=name, start=start, end=cursor))

    walk(main, ())
    return AssembledSource(
        text="".join(out),
        main_file=main,
        file_names=consumed,
        segments=segments,
        missing_inputs=missing,
    )
