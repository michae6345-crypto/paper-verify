"""Table parser acceptance tests.

Every assertion here is offline and reads a fixture from `fixtures/papers/`
directly. Nothing in this file touches the network, and nothing calls a model.

The three acceptance fixtures, and what each one is here to prove:

  1706.03762  Transformer  blocks, spacer columns, \\boldmath in \\multicolumn,
                           scientific notation, \\multirow, macro headers
  1810.04805  BERT         tabular*, @{...} inserts, {\\bf X} group bold,
                           two numbers in one cell, two-row header, macro labels
  1512.03385  ResNet       \\newcolumntype with an argument, and a column whose
                           direction is genuinely undeterminable
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pv.models import Direction
from pv.parse import cell_anchor, collect_macros, parse_tables
from pv.parse.colspec import collect_column_types, count_columns
from pv.parse.latexutil import clean_latex, split_cells, split_rows
from pv.parse.numbers import find_values

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "fixtures" / "papers"
TRANSFORMER = PAPERS / "1706.03762"
BERT = PAPERS / "1810.04805"
RESNET = PAPERS / "1512.03385"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def by_label(tables, label):
    matches = [t for t in tables if t.label == label]
    assert matches, f"no table labelled {label}; found {[t.label for t in tables]}"
    return matches[0]


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def transformer_tables():
    # Macros come from the main file; the tables live in results.tex. This is
    # the split ingest will hand us as one assembled document plus a macro dict.
    macros = collect_macros(read(TRANSFORMER / "ms.tex"))
    return parse_tables(read(TRANSFORMER / "results.tex"), macros)


@pytest.fixture(scope="module")
def bert_table():
    macros = collect_macros(read(BERT / "main.tex"))
    tables = parse_tables(read(BERT / "glue_official_tab.tex"), macros)
    return by_label(tables, "tab:glue_official")


@pytest.fixture(scope="module")
def resnet_tables():
    return parse_tables(read(RESNET / "residual_v1_arxiv_release.tex"))


# --------------------------------------------------------------------------
# Acceptance — Transformer, fixtures/GROUND_TRUTH.md case 1
# --------------------------------------------------------------------------


def test_transformer_finds_three_tabulars(transformer_tables):
    assert len(transformer_tables) == 3
    assert [t.label for t in transformer_tables] == [
        "tab:wmt-results",
        "tab:variations",
        "tab:parsing-results",
    ]


def test_en_fr_column_values(transformer_tables):
    """The EN-FR BLEU column, in source order.

    Column index 2, not cell index 2: the header's \\multicolumn cells and the
    spacer column both break that correspondence.
    """
    table = by_label(transformer_tables, "tab:wmt-results")
    values = [c.value for c in table.column_cells(2) if c.value is not None]
    assert values == [39.2, 39.92, 40.46, 40.56, 40.4, 41.16, 41.29, 38.1, 41.8]


def test_en_fr_column_empty_cell_is_not_zero(transformer_tables):
    """ByteNet reports no EN-FR score. That cell is "not reported", never 0.0."""
    table = by_label(transformer_tables, "tab:wmt-results")
    bytenet = [c for c in table.cells if c.row == 2]
    assert bytenet[0].text == "ByteNet"
    assert bytenet[2].text == ""
    assert bytenet[2].value is None


def test_en_fr_column_bold_is_exactly_the_two_expected(transformer_tables):
    table = by_label(transformer_tables, "tab:wmt-results")
    bold = [c for c in table.column_cells(2) if c.is_bold]
    assert [c.value for c in bold] == [41.29, 41.8]
    assert all(c.bold_source == "textbf" for c in bold)
    assert [c.value for c in table.column_cells(2) if not c.is_bold and c.value] == [
        39.2,
        39.92,
        40.46,
        40.56,
        40.4,
        41.16,
        38.1,
    ]


def test_the_two_bold_en_fr_values_are_in_different_blocks(transformer_tables):
    """41.29 is the best ensemble, 41.8 the best overall. A whole-column
    comparison reports `diverges` on 41.29, which is wrong — they are separated
    by a \\specialrule and belong to different blocks."""
    table = by_label(transformer_tables, "tab:wmt-results")
    blocks = {c.value: c.block for c in table.column_cells(2) if c.is_bold}
    assert blocks[41.29] != blocks[41.8]
    # And each is alone in its own block, so check 1 has an unambiguous max.
    for value, block in blocks.items():
        in_block = [c for c in table.column_cells(2) if c.block == block and c.is_bold]
        assert len(in_block) == 1, value


def test_cmidrule_does_not_start_a_block(transformer_tables):
    """`\\cmidrule{2-3} \\cmidrule{5-6}` sits between the two header rows. It
    covers part of the width only, so both header rows stay in block 0."""
    table = by_label(transformer_tables, "tab:wmt-results")
    assert {c.block for c in table.cells if c.row in (0, 1)} == {0}
    assert {c.block for c in table.cells if c.row == 2} == {1}


def test_spacer_column_is_flagged(transformer_tables):
    """The empty column between the BLEU pair and the Training Cost pair is
    layout, not data."""
    table = by_label(transformer_tables, "tab:wmt-results")
    assert [c.index for c in table.columns if c.is_spacer] == [3]
    assert all(c.text == "" for c in table.column_cells(3))


def test_boldmath_inside_multicolumn(transformer_tables):
    """\\multicolumn{2}{c}{\\boldmath$3.3\\cdot10^{18}$} — bold, scientific
    notation in math mode, and spanning two columns so it belongs to neither."""
    table = by_label(transformer_tables, "tab:wmt-results")
    cell = next(c for c in table.cells if c.value == 3.3e18)
    assert cell.is_bold is True
    assert cell.bold_source == "boldmath"
    assert cell.colspan == 2
    assert cell.col == 4  # starts at the Training Cost EN-DE column
    assert cell.value == pytest.approx(3.3e18)


def test_training_cost_column_is_lower_is_better(transformer_tables):
    """Why bolding 3.3e18 is correct rather than a finding."""
    table = by_label(transformer_tables, "tab:wmt-results")
    for index in (4, 5):
        column = table.columns[index]
        assert column.direction is Direction.LOWER_IS_BETTER
        assert column.direction_source == "lookup"


def test_bleu_columns_are_higher_is_better(transformer_tables):
    table = by_label(transformer_tables, "tab:wmt-results")
    for index in (1, 2):
        column = table.columns[index]
        assert column.metric == "BLEU"
        assert column.direction is Direction.HIGHER_IS_BETTER
        assert column.direction_source == "lookup"


def test_scientific_notation_is_exact(transformer_tables):
    """1.4·10^20 must not land on 1.3999999999999998e20; a finding would print
    that as a bogus delta."""
    table = by_label(transformer_tables, "tab:wmt-results")
    values = [c.value for c in table.column_cells(5) if c.value is not None]
    assert values == [1.0e20, 1.4e20, 1.5e20, 1.2e20, 8.0e20, 1.1e21, 1.2e21]


def test_junk_and_citations_are_stripped_from_labels(transformer_tables):
    """`\\rule{0pt}{2.0ex}Deep-Att + PosUnk Ensemble \\citep{...}` cleans to the
    model name, and the 0 and 2.0 inside \\rule never become values."""
    table = by_label(transformer_tables, "tab:wmt-results")
    labels = [c.text for c in table.column_cells(0)]
    assert labels == [
        "ByteNet",
        "Deep-Att + PosUnk",
        "GNMT + RL",
        "ConvS2S",
        "MoE",
        "Deep-Att + PosUnk Ensemble",
        "GNMT + RL Ensemble",
        "ConvS2S Ensemble",
        "Transformer (base model)",
        "Transformer (big)",
    ]
    assert all(c.value is None for c in table.column_cells(0))


def test_wmt_table_parses_without_warnings(transformer_tables):
    table = by_label(transformer_tables, "tab:wmt-results")
    assert table.parse_warnings == []
    assert table.n_cols == 6
    assert table.n_rows == 12


def test_anchors(transformer_tables):
    table = by_label(transformer_tables, "tab:wmt-results")
    assert table.anchor.kind == "table"
    assert table.anchor.dom_id == "tab:wmt-results"
    assert table.anchor.table_label == "tab:wmt-results"
    assert table.caption.startswith("The Transformer achieves better BLEU scores")

    cell = next(c for c in table.column_cells(2) if c.value == 41.8)
    anchor = cell_anchor(table, cell)
    assert anchor.kind == "table_cell"
    assert anchor.dom_id == f"tab:wmt-results/r{cell.row}/c{cell.col}"
    assert anchor.row == cell.row and anchor.col == cell.col
    assert anchor.human_locator == 'row 11, column "BLEU EN-FR"'


def test_variations_table_parses_with_multirow_and_macro_headers(transformer_tables):
    """13 columns, \\multirow group labels down the left, and headers that are
    macros defined in another file (\\dmodel, \\dff)."""
    table = by_label(transformer_tables, "tab:variations")
    assert table.n_cols == 13
    assert [c.header for c in table.columns] == [
        "",
        "N",
        "d_model",
        "d_ff",
        "h",
        "d_k",
        "d_v",
        "P_drop",
        "ε_ls",
        "train steps",
        "PPL (dev)",
        "BLEU (dev)",
        "params ×10^6",
    ]
    group_labels = [(c.text, c.rowspan) for c in table.cells if c.col == 0 and c.rowspan > 1]
    assert group_labels == [("(A)", 4), ("(B)", 2), ("(C)", 7), ("(D)", 4)]
    # PPL is lower-is-better, BLEU higher — both from the curated lookup.
    assert table.columns[10].metric == "PPL"
    assert table.columns[10].direction is Direction.LOWER_IS_BETTER
    assert table.columns[11].metric == "BLEU"
    assert table.columns[11].direction is Direction.HIGHER_IS_BETTER
    # The `big` row bolds the best PPL and the best BLEU.
    bold = {(c.col, c.value) for c in table.cells if c.is_bold}
    assert bold == {(10, 4.33), (11, 26.4)}


def test_parsing_results_table_uses_group_scoped_bold_headers(transformer_tables):
    table = by_label(transformer_tables, "tab:parsing-results")
    assert [c.header for c in table.columns] == ["Parser", "Training", "WSJ 23 F1"]
    assert all(c.bold_source == "bf" for c in table.cells if c.is_bold)


# --------------------------------------------------------------------------
# Acceptance — BERT, fixtures/GROUND_TRUTH.md case 2
# --------------------------------------------------------------------------


def test_bert_tabular_star_is_found(bert_table):
    """Hazard 1: the GLUE table is `tabular*`, not `tabular`."""
    assert bert_table.latex_source.startswith("\\begin{tabular*}{\\textwidth}")
    assert bert_table.label == "tab:glue_official"
    assert bert_table.caption.startswith("GLUE Test results")


def test_bert_extracolsep_insert_is_not_a_column(bert_table):
    """Hazard 2: `{l@{\\extracolsep{\\fill}}cccccccc c}` is ten columns, not
    eleven. One extra column shifts every value one place left."""
    assert bert_table.n_cols == 10
    assert count_columns("l@{\\extracolsep{\\fill}}cccccccc c") == (10, [])
    assert [c.col for c in bert_table.cells if c.row == 2] == list(range(10))


def test_bert_group_scoped_bold(bert_table):
    """Hazard 3: BERT bolds with `{\\bf 86.7/85.9}` — a switch scoped to the
    brace group, not a command taking an argument."""
    bold = [c for c in bert_table.cells if c.is_bold and not c.is_header]
    assert {c.row for c in bold} == {6}  # the BERT-large row, and only that row
    assert [c.col for c in bold] == list(range(1, 10))
    assert all(c.bold_source == "bf" for c in bold)
    assert next(c for c in bold if c.col == 9).value == 82.1


def test_bert_paired_values_in_one_cell(bert_table):
    """Hazard 4, and the most dangerous false positive in the corpus.

    `86.7/85.9` is two numbers. Both land in `Cell.values`; the scalar
    `Cell.value` stays None because there is no single value. Taking the first
    number instead makes the Average column a mean of eight values rather than
    nine, and reports `diverges` on all five rows of a landmark paper.
    """
    mnli = list(bert_table.column_cells(1))
    assert [c.text for c in mnli] == [
        "80.6/80.1",
        "76.4/76.1",
        "82.1/81.4",
        "84.6/83.4",
        "86.7/85.9",
    ]
    assert [c.values for c in mnli] == [
        [80.6, 80.1],
        [76.4, 76.1],
        [82.1, 81.4],
        [84.6, 83.4],
        [86.7, 85.9],
    ]
    assert all(c.value is None for c in mnli)


def test_multi_value_cells_raise_no_parse_warning(bert_table):
    """A cell holding two numbers is fully represented once `values` carries
    them, so it is not structural uncertainty. Warning here would make check 3
    return unverifiable on the whole GLUE table, which ground truth says should
    verify — declining to look is not the same as being right."""
    assert bert_table.parse_warnings == []


def test_cell_values_invariant_holds_across_the_corpus(bert_table, transformer_tables, resnet_tables):
    """Contract invariant: exactly one number -> `value` set and equal to
    `values[0]`; otherwise `value` is None."""
    tables = [bert_table, *transformer_tables, *resnet_tables]
    for table in tables:
        for cell in table.cells:
            if len(cell.values) == 1:
                assert cell.value == cell.values[0], cell
            else:
                assert cell.value is None, cell


def test_bert_two_row_header(bert_table):
    """Hazard 6: task names, then training-set sizes. Both rows are header."""
    assert {c.row for c in bert_table.cells if c.is_header} == {0, 1}
    assert bert_table.columns[1].header == "MNLI-(m/mm) 392k"
    assert bert_table.columns[9].header == "Average -"
    # The header itself carries no direction — no arrow, no known metric name.
    assert bert_table.columns[1].direction is Direction.UNKNOWN
    assert bert_table.columns[1].direction_source is None


def test_bert_macro_row_labels_resolve(bert_table):
    """Hazard 7: `\\bertbase` is defined in main.tex, not in the table file."""
    assert [c.text for c in bert_table.column_cells(0)] == [
        "Pre-OpenAI SOTA",
        "BiLSTM+ELMo+Attn",
        "OpenAI GPT",
        "BERT_BASE",
        "BERT_LARGE",
    ]


def test_bert_blocks(bert_table):
    """`\\hline` before the BERT rows separates them from the prior work."""
    blocks = {c.row: c.block for c in bert_table.cells}
    assert blocks[0] == blocks[1] == 0
    assert blocks[2] == blocks[3] == blocks[4] == 1
    assert blocks[5] == blocks[6] == 2


def test_bert_average_column_ground_truth(bert_table):
    """The stated averages from GROUND_TRUTH.md case 2, read back off the parse."""
    assert [c.value for c in bert_table.column_cells(9)] == [74.0, 71.0, 75.1, 79.6, 82.1]


# --------------------------------------------------------------------------
# Acceptance — ResNet, fixtures/GROUND_TRUTH.md case 3
# --------------------------------------------------------------------------


def test_resnet_custom_column_type_with_argument(resnet_tables):
    """Hazard 5: `\\newcolumntype{x}[1]{>{\\centering}p{#1pt}}`, used as
    `{l|x{42}|c}`. `x{42}` is one column, and the `{42}` is its argument."""
    table = by_label(resnet_tables, "tab:plain_vs_shortcut")
    assert table.n_cols == 3
    assert collect_column_types(read(RESNET / "residual_v1_arxiv_release.tex"))["x"] == 1
    assert count_columns("l|x{42}|c", {"x": 1}) == (3, [])


def test_resnet_error_table_contents(resnet_tables):
    table = by_label(resnet_tables, "tab:plain_vs_shortcut")
    assert [c.header for c in table.columns] == ["", "plain", "ResNet"]
    assert [c.value for c in table.column_cells(1)] == [27.94, 28.54]
    assert [c.value for c in table.column_cells(2)] == [27.88, 25.03]
    bold = [c for c in table.cells if c.is_bold]
    assert [(c.col, c.value, c.bold_source) for c in bold] == [(2, 25.03, "textbf")]


def test_resnet_direction_stays_unknown(resnet_tables):
    """Hazard 10, and the whole point of case 3.

    The bolded 25.03 is the column *minimum*, which is right because these are
    error rates — but the headers are `plain` and `ResNet`. No arrow, no metric
    name, nothing. "Error" appears only in the caption and the prose. Unknown is
    the honest answer; check 1 must return unverifiable /
    METRIC_DIRECTION_UNKNOWN rather than guess either way.
    """
    table = by_label(resnet_tables, "tab:plain_vs_shortcut")
    assert "error" in table.caption.lower()  # the caption does say it
    for column in table.columns:
        assert column.direction is Direction.UNKNOWN
        assert column.direction_source is None
        assert column.metric is None


def test_resnet_user_macro_bold_is_attributed_to_the_macro(resnet_tables):
    """`\\renewcommand{\\hl}[1]{\\textbf{#1}}` — bold behind a user macro. The
    source names the macro so a reader can see where the bold came from."""
    table = by_label(resnet_tables, "tab:voc07_all")
    bold = [c for c in table.cells if c.is_bold]
    assert bold, "no bold found in tab:voc07_all"
    assert {c.bold_source for c in bold} == {"macro:hl"}
    assert table.n_cols == 24


def test_whole_resnet_paper_parses(resnet_tables):
    """Fifteen tabulars, several inside floats whose \\end is commented out."""
    assert len(resnet_tables) == 15
    dom_ids = [t.anchor.dom_id for t in resnet_tables]
    assert len(dom_ids) == len(set(dom_ids)), "anchors must be unique"


# --------------------------------------------------------------------------
# Unit tests for the pieces the acceptance cases depend on
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body,expected",
    [
        (r"a & b \\ c & d", ["a & b ", " c & d"]),
        (r"a \\[2pt] b", ["a ", " b"]),
        (r"a \\*[1ex] b", ["a ", " b"]),
        # A nested environment owns its own row breaks.
        (r"\begin{tabular}{c}x \\ y\end{tabular} & z \\ q", [r"\begin{tabular}{c}x \\ y\end{tabular} & z ", " q"]),
    ],
)
def test_split_rows(body, expected):
    assert split_rows(body) == expected


@pytest.mark.parametrize(
    "row,expected",
    [
        (r"a & b & c", ["a ", " b ", " c"]),
        (r"a \& b & c", [r"a \& b ", " c"]),  # escaped ampersand is not a separator
        (r"$x & y$ & c", ["$x & y$ ", " c"]),  # inside math it is alignment, not a cell
        (r"{a & b} & c", ["{a & b} ", " c"]),  # inside a group
    ],
)
def test_split_cells(row, expected):
    assert split_cells(row) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        (r"41.29", [41.29]),
        (r"3.3\cdot10^{18}", [3.3e18]),
        (r"2.3\times10^{19}", [2.3e19]),
        (r"1.0\cdot10^{20}", [1.0e20]),
        (r"\times10^6", [1e6]),
        ("100K", [1e5]),
        ("8.5k", [8500.0]),
        ("12.3%", [12.3]),
        ("-0.5", [-0.5]),
        ("86.7/85.9", [86.7, 85.9]),  # two values; the cell reports none
        ("ConvS2S", []),  # a digit inside a name is not a value
        ("SST-2", []),
        ("ResNet-101", []),
        ("", []),
    ],
)
def test_find_values(text, expected):
    assert find_values(text) == pytest.approx(expected)


@pytest.mark.parametrize(
    "latex,expected",
    [
        (r"\rule{0pt}{2.0ex}Deep-Att \citep{zhou}", "Deep-Att"),
        (r"\textbf{41.29}", "41.29"),
        (r"{\bf 86.7/85.9}", "86.7/85.9"),
        (r"\boldmath$3.3\cdot10^{18}$", "3.3·10^18"),
        (r"\multicolumn{2}{c}{BLEU}", "BLEU"),
        (r"\multirow{2}{*}{\vspace{-2mm}Model}", "Model"),
        (r"\textcolor{red}{x}", ""),
        (r"\label{tab:x}\vspace{-2mm}", ""),
    ],
)
def test_clean_latex(latex, expected):
    assert clean_latex(latex) == expected


def test_commented_out_rules_do_not_create_blocks():
    """results.tex has a commented-out `%\\hline` and `%\\specialrule` just above
    `\\bottomrule`. Either would add a phantom block."""
    latex = (
        "\\begin{table}\\label{tab:t}\\begin{tabular}{cc}\n"
        "\\toprule\na & b \\\\\n\\hline\n1 & 2 \\\\\n%\\hline\n3 & 4 \\\\\n"
        "\\bottomrule\n\\end{tabular}\\end{table}"
    )
    table = parse_tables(latex)[0]
    assert {c.row: c.block for c in table.cells} == {0: 0, 1: 1, 2: 1}


def test_arrow_in_header_beats_the_lookup():
    """An explicit `\\downarrow` on a normally-higher-is-better metric wins, and
    says it came from an arrow."""
    latex = (
        "\\begin{table}\\label{tab:t}\\begin{tabular}{cc}\n"
        "\\toprule\nModel & BLEU $\\downarrow$ \\\\\n\\midrule\na & 1.0 \\\\\n"
        "\\bottomrule\n\\end{tabular}\\end{table}"
    )
    column = parse_tables(latex)[0].columns[1]
    assert column.direction is Direction.LOWER_IS_BETTER
    assert column.direction_source == "arrow"


def test_contradictory_arrows_refuse_to_choose():
    latex = (
        "\\begin{table}\\label{tab:t}\\begin{tabular}{cc}\n"
        "\\toprule\nModel & Score $\\uparrow$ $\\downarrow$ \\\\\n\\midrule\na & 1.0 \\\\\n"
        "\\bottomrule\n\\end{tabular}\\end{table}"
    )
    column = parse_tables(latex)[0].columns[1]
    assert column.direction is Direction.UNKNOWN
    assert column.direction_source is None


def test_table_without_any_rule_marks_no_header_and_warns():
    latex = (
        "\\begin{table}\\label{tab:t}\\begin{tabular}{cc}\n"
        "a & 1 \\\\\nb & 2 \\\\\n\\end{tabular}\\end{table}"
    )
    table = parse_tables(latex)[0]
    assert not any(c.is_header for c in table.cells)
    assert any("no full-width rule" in w for w in table.parse_warnings)


def test_ragged_row_is_warned_not_guessed():
    latex = (
        "\\begin{table}\\label{tab:t}\\begin{tabular}{ccc}\n"
        "\\toprule\na & b & c \\\\\n\\midrule\n1 & 2 \\\\\n"
        "\\bottomrule\n\\end{tabular}\\end{table}"
    )
    table = parse_tables(latex)[0]
    assert any("covers 2 columns" in w for w in table.parse_warnings)


def test_user_macro_bold_expansion():
    """The Transformer defines `\\newcommand{\\mbf}[1]{\\mathbf{#1}}`. Bold
    detection has to expand macros; a regex over the raw source cannot see this."""
    latex = (
        "\\newcommand{\\mbf}[1]{\\mathbf{#1}}\n"
        "\\begin{table}\\label{tab:t}\\begin{tabular}{cc}\n"
        "\\toprule\nModel & BLEU \\\\\n\\midrule\na & $\\mbf{41.8}$ \\\\\n"
        "\\bottomrule\n\\end{tabular}\\end{table}"
    )
    cell = next(c for c in parse_tables(latex)[0].cells if c.value == 41.8)
    assert cell.is_bold is True
    assert cell.bold_source == "macro:mbf"
