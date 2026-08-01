"""Deterministic claim mining (§14.3).

Checkers change from "given the whole document, find things to check" to "given
these claims, evaluate the ones you apply to". This module is the first half of
that sentence, and it never calls a model.

Each producer here is the *same* function the corresponding checker uses to find
its subject matter — table cells through `checks._cells.table_claims`, URLs through
`checks.links.extract_urls`, references through `checks.citations.parse_bibliography`.
Deliberately so. If mining found a different set of URLs than the link check does,
the claims table would describe a paper that was never checked, and the checked
paper would leave no rows behind. One producer per kind, used by both sides.

Dependency direction is `claims -> checks`, never the reverse; a checker that is
handed no claims falls back to its own producer, which is this same function.
"""

from __future__ import annotations

from ..checks._cells import table_claims
from ..checks.citations import citation_claims
from ..checks.links import link_claims
from ..models import Claim, SourceDocument, Table


def mine(document: SourceDocument, tables: list[Table]) -> list[Claim]:
    """Every checkable assertion in the paper, deterministically.

    Deterministic producers only — no model involved at this stage:
      - one claim per non-header table cell holding a value   -> kind="body_number"
      - one claim per URL found in the source                 -> kind="link"
      - one claim per bibliography entry                      -> kind="citation"

    Model-assisted producers (checks 4-5, later) append to this list; they never
    replace it, and any claim whose anchor does not resolve against `tables` is
    discarded silently.
    """
    latex = document.assembled_latex
    return [
        *mine_body_numbers(tables),
        *mine_links(latex),
        *mine_citations(latex),
    ]


def mine_body_numbers(tables: list[Table]) -> list[Claim]:
    """One claim per non-header cell that states a value, in table then cell order.

    A cell holding several numbers yields one claim carrying all of them, with
    `value` left None. Reading `86.7/85.9` as `86.7` here would put the worst false
    positive we have found (GROUND_TRUTH.md case 2) into the claims themselves,
    below the level any checker could see it.

    Tables the parser could not fully resolve still yield claims: the cell is what
    the paper says either way. Declining to judge it is the checker's call, made
    out loud with `TABLE_STRUCTURE_NOT_PARSED`, not a silent absence here.
    """
    return [claim for table in tables for claim in table_claims(table)]


def mine_links(latex: str) -> list[Claim]:
    """One claim per URL occurrence, in document order.

    A URL is a claim that a resource exists. Commented-out URLs are not in the
    paper and `extract_urls` already drops them. The hash keys on the cleaned URL,
    not on the LaTeX that spells it: `\\url{https://x.org/a\\_b}` and a bare
    `https://x.org/a_b` are one claim about one resource.
    """
    return link_claims(latex)


def mine_citations(latex: str) -> list[Claim]:
    """One claim per bibliography entry, in bibliography order.

    A reference is a claim that a work exists and stands. Absence from an index is
    never a finding — see `checks/citations.py` — but the claim is still mined, so
    the row exists and says what was looked for.
    """
    return citation_claims(latex)


__all__ = ["mine", "mine_body_numbers", "mine_citations", "mine_links"]
