"""arXiv id -> fully populated `SourceDocument`.

This is the only entry point other workstreams should need. The intermediate
artefacts (macro objects, per-file segments) stay available on `IngestResult`
for anything the contract does not carry.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from pv.models import ReasonCode, SourceDocument

from .assemble import AssembledSource, assemble
from .fetch import DEFAULT_CACHE_DIR, FetchResult, fetch_source, load_directory
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


def ingest(
    arxiv_id: str,
    *,
    cache_dir: str | Path = DEFAULT_CACHE_DIR,
    allow_network: bool = True,
) -> IngestResult:
    """Fetch (or read from cache) and assemble one paper."""
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
        return IngestResult(
            document=document,
            reason=fetched.reason or ReasonCode.NO_LATEX_SOURCE,
            detail=fetched.detail or "no source files",
            from_cache=fetched.from_cache,
        )

    try:
        assembled = assemble(fetched.files)
    except ValueError as exc:
        return IngestResult(
            document=document,
            reason=ReasonCode.NO_LATEX_SOURCE,
            detail=str(exc),
            from_cache=fetched.from_cache,
        )

    macros = extract_macros(assembled.text)
    document.assembled_latex = assembled.text
    document.macros = macro_table(macros)
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
