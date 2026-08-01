"""Ingest: arXiv id -> `SourceDocument`.

    from pv.ingest import ingest, ingest_directory
    result = ingest("1706.03762")
    doc = result.document          # pv.models.SourceDocument

Everything here is deterministic and offline once a paper is cached. No model
is ever called.
"""

from .assemble import AssembledSource, Segment, assemble, find_main_file
from .fetch import FetchResult, fetch_source, load_directory, normalize_arxiv_id
from .macros import Macro, expand, extract_macros, macro_table
from .metadata import extract_abstract, extract_title
from .pipeline import (
    IngestResult,
    build,
    file_spans,
    ingest,
    ingest_directory,
    macro_defs,
    source_hash,
)

__all__ = [
    "AssembledSource",
    "FetchResult",
    "IngestResult",
    "Macro",
    "Segment",
    "assemble",
    "build",
    "expand",
    "extract_abstract",
    "extract_macros",
    "extract_title",
    "fetch_source",
    "file_spans",
    "find_main_file",
    "ingest",
    "ingest_directory",
    "load_directory",
    "macro_defs",
    "macro_table",
    "normalize_arxiv_id",
    "source_hash",
]
