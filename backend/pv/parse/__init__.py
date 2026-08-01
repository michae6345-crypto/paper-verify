"""Table parsing: LaTeX source in, `list[Table]` out.

The one function checks should call:

    from pv.parse import parse_tables
    tables = parse_tables(document.assembled_latex, document.macros)

or, given ingest's `SourceDocument` directly:

    from pv.parse import parse_document
    tables = parse_document(document)

Both are pure, offline and deterministic. No model is called anywhere in this
package. Where structure is ambiguous the table carries `parse_warnings` and the
affected field is left unset, so checks return `unverifiable` rather than guess.
"""

from __future__ import annotations

from pv.models import SourceDocument, Table

from .colspec import collect_column_types, count_columns
from .latexutil import clean_latex, collect_macro_defs, collect_macros, expand_macros
from .tabular import cell_anchor, parse_tables

__all__ = [
    "parse_tables",
    "parse_document",
    "cell_anchor",
    "collect_macros",
    "collect_macro_defs",
    "collect_column_types",
    "count_columns",
    "clean_latex",
    "expand_macros",
]


def parse_document(document: SourceDocument) -> list[Table]:
    """Parse every tabular in an assembled `SourceDocument` from ingest.

    Prefers `macro_defs` over the flat `macros` dict: the former records how many
    arguments each macro takes, and expanding an argument-taking macro without
    consuming its argument corrupts the cell.
    """
    return parse_tables(
        document.assembled_latex, document.macro_defs or document.macros
    )
