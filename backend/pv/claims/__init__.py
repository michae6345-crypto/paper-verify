"""Claim mining — every checkable assertion in a paper, as data (§14.3).

Until `Claim` had call sites, every run produced a report and discarded the
structured intermediate, which meant ten papers processed left exactly as much
accumulated knowledge as zero. This package is the input the database thesis was
missing.

    from pv.claims import mine
    claims = mine(document, tables)
"""

from __future__ import annotations

from .mine import mine, mine_body_numbers, mine_citations, mine_links

__all__ = ["mine", "mine_body_numbers", "mine_citations", "mine_links"]
