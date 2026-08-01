"""arXiv id -> fully populated `SourceDocument`.

This is the only entry point other workstreams should need. The intermediate
artefacts (macro objects, per-file segments) stay available on `IngestResult`
for anything the contract does not carry.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from pv.models import FileSpan, MacroDef, ReasonCode, SourceDocument

from .assemble import AssembledSource, assemble
from .fetch import FetchResult, fetch_source, load_directory
from .macros import Macro, extract_macros, macro_table
from .metadata import extract_abstract, extract_title


@dataclass
class IngestResult:
    """`document` is the contract object; the rest is detail for in-process use."""

    document: SourceDocument
    reason: ReasonCode | None = None
    detail: str = ""
    from_cache: bool = False
    # Macro objects, including argument counts. `document.macros` is the
    # flattened name -> body form the contract carries.
    macro_objects: dict[str, Macro] = field(default_factory=dict)
    assembled: AssembledSource | None = None

    @property
    def ok(self) -> bool:
        return self.reason is None and bool(self.document.assembled_latex)


def source_hash(assembled_latex: str) -> str:
    return hashlib.sha256(assembled_latex.encode("utf-8")).hexdigest()


def macro_defs(macros: dict[str, Macro]) -> dict[str, MacroDef]:
    """The contract's authoritative macro table.

    Keyed by name **without** the leading backslash, matching `MacroDef.name`.
    The flat `SourceDocument.macros` keeps its own convention — keys there carry
    the backslash — so the two relate as
    `macro_defs[k].body == macros["\\" + k]` for every k.
    """
    return {
        m.name: MacroDef(name=m.name, body=m.body, n_args=m.n_args) for m in macros.values()
    }


def file_spans(assembled: AssembledSource) -> list[FileSpan]:
    """The offset map, outermost first: the main file's span, then each
    `\\input`ed file's span nested inside it, in source order."""
    ordered = sorted(assembled.segments, key=lambda s: (s.start, -s.end))
    return [FileSpan(file_name=s.file_name, start=s.start, end=s.end) for s in ordered]


def _declined(
    document: SourceDocument, fetched: FetchResult, reason: ReasonCode, detail: str
) -> IngestResult:
    """A paper we could not read is still a `SourceDocument` — it carries the
    reason instead of the LaTeX, and the runner puts it in "not checked"."""
    document.ingest_reason = reason
    document.ingest_detail = detail
    return IngestResult(
        document=document, reason=reason, detail=detail, from_cache=fetched.from_cache
    )


def ingest(
    arxiv_id: str,
    *,
    cache_dir: str | Path | None = None,
    allow_network: bool = True,
) -> IngestResult:
    """Fetch (or read from cache) and assemble one paper.

    `cache_dir` defaults to `default_cache_dir()`, which is absolute and does
    not depend on the working directory.
    """
    fetched = fetch_source(arxiv_id, cache_dir=cache_dir, allow_network=allow_network)
    return build(fetched)


def ingest_directory(path: str | Path, arxiv_id: str = "local") -> IngestResult:
    """Assemble an already-extracted source tree. Never touches the network."""
    return build(load_directory(path, arxiv_id=arxiv_id))


def build(fetched: FetchResult) -> IngestResult:
    """Assemble a `FetchResult` into a `SourceDocument`.

    A fetch that carried a reason code (a PDF-only paper, a network failure)
    passes straight through as an empty document plus that reason — never an
    exception. The run reports it under "not checked".
    """
    document = SourceDocument(
        arxiv_id=fetched.arxiv_id,
        version=fetched.version,
        fetched_at=fetched.fetched_at,
    )
    if fetched.reason is not None or not fetched.files:
        return _declined(
            document,
            fetched,
            fetched.reason or ReasonCode.NO_LATEX_SOURCE,
            fetched.detail or "no source files",
        )

    try:
        assembled = assemble(fetched.files)
    except ValueError as exc:
        return _declined(document, fetched, ReasonCode.NO_LATEX_SOURCE, str(exc))

    macros = extract_macros(assembled.text)
    document.assembled_latex = assembled.text
    document.macros = macro_table(macros)
    document.macro_defs = macro_defs(macros)
    document.segments = file_spans(assembled)
    document.file_names = list(assembled.file_names)
    document.source_hash = source_hash(assembled.text)
    document.title = extract_title(assembled.text, macros)
    document.abstract = extract_abstract(assembled.text, macros)

    return IngestResult(
        document=document,
        from_cache=fetched.from_cache,
        macro_objects=macros,
        assembled=assembled,
    )
