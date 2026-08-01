"""Claim mining (§14.3) and the claim-driven checkers.

`Claim` had zero call sites, which meant every run produced a report and threw the
structured intermediate away. These tests pin the shape of what is now kept, and —
the load-bearing one — that mining a paper's claims and handing them to a checker
produces exactly what the checker produced when it scanned the document itself.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pv.checks import bold_extreme, citations, links, row_arithmetic  # noqa: E402
from pv.checks._cells import index_cells, resolve, table_claims  # noqa: E402
from pv.claims import mine, mine_body_numbers, mine_citations, mine_links  # noqa: E402
from pv.fingerprint import claim_content_hash  # noqa: E402
from pv.models import (  # noqa: E402
    Anchor,
    CheckContext,
    Claim,
    SourceDocument,
)

from tests.test_checks_arith import (  # noqa: E402
    bert_glue,
    cell,
    column,
    elmo_alternate_weights,
    parsed_bert_glue,
    table,
    transformer_en_fr,
)

FIXTURE = ROOT / "fixtures" / "papers" / "1706.03762"


@pytest.fixture(scope="module")
def transformer_latex() -> str:
    return "\n".join(
        p.read_text(encoding="utf-8", errors="replace") for p in sorted(FIXTURE.glob("*.tex"))
    )


def document(latex: str = "") -> SourceDocument:
    return SourceDocument(arxiv_id="0000.00000", assembled_latex=latex)


# --------------------------------------------------------------------------
# body_number
# --------------------------------------------------------------------------


def test_one_claim_per_non_header_cell_that_states_a_value():
    t = transformer_en_fr()
    claims = table_claims(t)
    assert len(claims) == 9  # every cell in the EN-FR column
    assert {c.kind for c in claims} == {"body_number"}
    assert [c.value for c in claims][:4] == [39.2, 39.92, 40.46, 40.56]


def test_header_cells_and_empty_cells_state_nothing():
    """An empty cell in an ML table means "not reported", never zero, so it makes
    no claim at all — there is nothing there to check."""
    t = table(
        [column(0, "System"), column(1, "BLEU")],
        [
            cell(0, 0, "System", is_header=True),
            cell(0, 1, "BLEU", is_header=True),
            cell(1, 0, "Ours"),
            cell(1, 1, ""),
            cell(2, 0, "Theirs"),
            cell(2, 1, "41.8"),
        ],
    )
    claims = table_claims(t)
    assert [c.verbatim for c in claims] == ["41.8"]


def test_a_multi_value_cell_does_not_silently_become_its_first_number():
    """GROUND_TRUTH.md case 2, pushed one layer earlier. Reading `86.7/85.9` as
    86.7 during mining would bury the worst false positive we have found below the
    level any checker could see it."""
    claims = table_claims(bert_glue())
    pair = next(c for c in claims if c.verbatim == "86.7/85.9")
    assert pair.value is None
    assert pair.normalized["values"] == [86.7, 85.9]


def test_claim_anchors_follow_the_dom_id_convention():
    claim = table_claims(transformer_en_fr())[0]
    assert claim.anchor.kind == "table_cell"
    assert claim.anchor.dom_id == "tab:wmt-results/r0/c0"
    assert claim.anchor.row == 0 and claim.anchor.col == 0
    assert claim.locator == claim.anchor.human_locator


# --------------------------------------------------------------------------
# content_hash
# --------------------------------------------------------------------------


def test_content_hash_is_set_and_distinguishes_every_claim():
    claims = table_claims(bert_glue())
    assert all(c.content_hash for c in claims)
    assert len({c.content_hash for c in claims}) == len(claims)


def test_content_hash_is_stable_across_runs():
    first = [c.content_hash for c in table_claims(bert_glue())]
    second = [c.content_hash for c in table_claims(bert_glue())]
    assert first == second


def test_trailing_zeros_do_not_change_a_claims_identity():
    """41.8 and 41.80 are the same number. A parser reporting more digits must not
    make the paper appear to have made a different claim."""
    assert claim_content_hash("body_number", "t/r0/c0", "41.8", 41.8) == claim_content_hash(
        "body_number", "t/r0/c0", "41.8", 41.80
    )


# --------------------------------------------------------------------------
# links and citations
# --------------------------------------------------------------------------


def test_links_are_mined_from_the_source(transformer_latex):
    claims = mine_links(transformer_latex)
    assert claims and {c.kind for c in claims} == {"link"}
    assert all(c.verbatim.startswith("http") for c in claims)
    assert len({c.anchor.dom_id for c in claims}) == len(claims)


def test_a_commented_out_url_is_not_a_claim():
    latex = "See \\url{https://live.example}\n% \\url{https://commented.example}\n"
    assert [c.verbatim for c in mine_links(latex)] == ["https://live.example"]


def test_two_mentions_of_one_url_are_two_claims_with_two_identities():
    latex = r"\url{https://example.org/a} and again \url{https://example.org/a}"
    claims = mine_links(latex)
    assert len(claims) == 2
    assert claims[0].content_hash != claims[1].content_hash


def test_citations_are_mined_from_the_bibliography(transformer_latex):
    claims = mine_citations(transformer_latex)
    assert len(claims) > 20
    assert {c.kind for c in claims} == {"citation"}
    assert all(c.anchor.kind == "reference" for c in claims)
    assert any("Attention" in c.verbatim or "attention" in c.verbatim for c in claims)


def test_mine_returns_all_three_kinds(transformer_latex):
    claims = mine(document(transformer_latex), [transformer_en_fr()])
    kinds = {c.kind for c in claims}
    assert kinds == {"body_number", "link", "citation"}
    assert len(claims) == (
        len(mine_body_numbers([transformer_en_fr()]))
        + len(mine_links(transformer_latex))
        + len(mine_citations(transformer_latex))
    )


def test_mine_is_deterministic(transformer_latex):
    doc, tables = document(transformer_latex), [transformer_en_fr()]
    assert [c.content_hash for c in mine(doc, tables)] == [
        c.content_hash for c in mine(doc, tables)
    ]


# --------------------------------------------------------------------------
# Resolution
# --------------------------------------------------------------------------


def unresolvable() -> Claim:
    return Claim(
        kind="body_number",
        locator="nowhere",
        verbatim="99.9",
        anchor=Anchor(kind="table_cell", dom_id="tab:nonexistent/r0/c0", row=0, col=0),
        value=99.9,
        content_hash="deadbeef",
    )


def test_a_claim_that_does_not_resolve_is_discarded_silently():
    """§14.3. Safe only because a claim we cannot locate cannot be checked — it can
    carry no verdict, so dropping it accuses nobody of anything."""
    t = transformer_en_fr()
    assert resolve(unresolvable(), index_cells([t])) is None
    ctx = CheckContext(document=document(), tables=[t], claims=[unresolvable()])
    assert not bold_extreme.applies(unresolvable(), ctx)
    assert not row_arithmetic.applies(unresolvable(), ctx)


def test_an_unresolvable_claim_does_not_suppress_the_ones_that_resolve():
    """The silence stops at the claim that could not be located. A checker handed
    one good claim and one bad one still judges the good one."""
    t = transformer_en_fr()
    good = table_claims(t)
    ctx = CheckContext(document=document(), tables=[t], claims=[unresolvable(), *good])
    assert bold_extreme.run(ctx).verdict.value == "matches"


# --------------------------------------------------------------------------
# applies()
# --------------------------------------------------------------------------


def test_bold_extreme_applies_only_to_bolded_cells():
    t = transformer_en_fr()
    ctx = CheckContext(document=document(), tables=[t])
    applicable = [c for c in table_claims(t) if bold_extreme.applies(c, ctx)]
    assert [c.verbatim for c in applicable] == ["41.29", "41.8"]


def test_row_arithmetic_applies_only_to_average_columns():
    t = bert_glue()
    ctx = CheckContext(document=document(), tables=[t])
    applicable = [c for c in table_claims(t) if row_arithmetic.applies(c, ctx)]
    assert [c.verbatim for c in applicable] == ["74.0", "71.0", "75.1", "79.6", "82.1"]


def test_row_arithmetic_applies_to_nothing_in_elmos_grouping():
    """GROUND_TRUTH.md case 4. "All layers" is a grouping, not an aggregate, so
    there is no claim here for check 3 to evaluate."""
    t = elmo_alternate_weights()
    ctx = CheckContext(document=document(), tables=[t])
    assert not any(row_arithmetic.applies(c, ctx) for c in table_claims(t))


def test_link_and_citation_checks_claim_their_own_kinds():
    ctx = CheckContext(document=document())
    link = mine_links(r"\url{https://example.org/a}")[0]
    cite = mine_citations(r"\bibitem{a} A Author.\newblock A title.\newblock Venue, 2020.")[0]
    assert links.applies(link, ctx) and not links.applies(cite, ctx)
    assert citations.applies(cite, ctx) and not citations.applies(link, ctx)


# --------------------------------------------------------------------------
# The invariant that makes the refactor safe
# --------------------------------------------------------------------------


@pytest.mark.parametrize("build", [transformer_en_fr, bert_glue, elmo_alternate_weights])
@pytest.mark.parametrize("checker", [bold_extreme, row_arithmetic])
def test_supplying_claims_changes_nothing_about_the_verdict(build, checker):
    """Where claims come from must not change what is checked.

    `ctx.claims` populated by an orchestrator and `ctx.claims` empty run through
    the same producer, so the two paths are the same run. If they ever diverge, a
    paper's verdict depends on which driver executed it — which is the opposite of
    §14.1's "same inputs, same verdict, forever".
    """
    t = build()
    scanned = checker.run(CheckContext(document=document(), tables=[t]))
    supplied = checker.run(
        CheckContext(document=document(), tables=[t], claims=mine(document(), [t]))
    )
    assert scanned.verdict is supplied.verdict
    assert scanned.reason is supplied.reason
    assert scanned.fingerprint == supplied.fingerprint
    assert [f.model_dump() for f in scanned.findings] == [
        f.model_dump() for f in supplied.findings
    ]


def test_the_parsed_bert_table_gives_the_same_answer_either_way():
    """The same invariant against the real parser rather than a hand-built table."""
    t = parsed_bert_glue()
    claims = mine(document(), [t])
    scanned = row_arithmetic.run(CheckContext(document=document(), tables=[t]))
    supplied = row_arithmetic.run(
        CheckContext(document=document(), tables=[t], claims=claims)
    )
    assert scanned.verdict is supplied.verdict
    assert [f.claimed for f in supplied.findings] == ["71.0"]
    assert [f.computed for f in supplied.findings] == ["70.944"]


# --------------------------------------------------------------------------
# observe()
# --------------------------------------------------------------------------


def test_observe_returns_a_measurement_and_no_verdict():
    t = bert_glue()
    ctx = CheckContext(document=document(), tables=[t])
    claim = next(c for c in table_claims(t) if row_arithmetic.applies(c, ctx))
    observation = row_arithmetic.observe(claim, ctx)
    assert observation.status == "ok"
    assert observation.claim_id == claim.content_hash
    assert observation.checker == "row_arithmetic"
    assert observation.measured["claimed"] == 74.0
    assert round(observation.measured["computed"], 3) == 74.0
    # Nothing on an Observation names a verdict. That is the adjudicator's word.
    assert not hasattr(observation, "verdict")


def test_observe_declines_a_claim_it_does_not_apply_to():
    t = bert_glue()
    ctx = CheckContext(document=document(), tables=[t])
    label = next(c for c in table_claims(t) if c.verbatim == "86.7/85.9")
    assert row_arithmetic.observe(label, ctx).status == "not_applicable"


def test_observe_says_why_it_could_not_measure():
    """The bolded pair in BERT's table: no single value to be the best of, and the
    observation records that rather than passing over the cell."""
    t = bert_glue()
    bolded = t.model_copy(
        update={
            "cells": [
                c.model_copy(update={"is_bold": True}) if c.text == "86.7/85.9" else c
                for c in t.cells
            ]
        }
    )
    ctx = CheckContext(document=document(), tables=[bolded])
    claim = next(c for c in table_claims(bolded) if c.verbatim == "86.7/85.9")
    observation = bold_extreme.observe(claim, ctx)
    assert observation.status == "insufficient_data"
    assert observation.reason.value == "cell_has_multiple_values"
