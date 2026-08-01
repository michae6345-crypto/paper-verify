"""Acceptance tests for the arithmetic checks (1 and 3).

Every table here is hand-built against the `Table` / `Cell` / `Column` contract in
`backend/pv/models.py`, never against the parser's output, so these tests stand on
their own. The numbers come from `fixtures/GROUND_TRUTH.md`.
"""

from __future__ import annotations

import re
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from pv.checks import bold_extreme, registry, row_arithmetic  # noqa: E402
from pv.models import (  # noqa: E402
    Anchor,
    Cell,
    CheckContext,
    Column,
    Direction,
    ReasonCode,
    Severity,
    SourceDocument,
    Table,
    Verdict,
)

# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------

_NUMERIC = re.compile(r"^[-+]?\d+(?:\.\d+)?$")
_PAIR = re.compile(r"^[-+]?\d+(?:\.\d+)?(?:\s*/\s*[-+]?\d+(?:\.\d+)?)+$")


def cell(row: int, col: int, text: str, **kwargs) -> Cell:
    """A cell as agent B emits it, including the `values` / `value` invariant:
    one number populates both, several populate only `values`."""
    stripped = text.strip()
    if _NUMERIC.match(stripped):
        values = [float(stripped)]
    elif _PAIR.match(stripped):
        values = [float(part) for part in stripped.split("/")]
    else:
        values = [kwargs["value"]] if kwargs.get("value") is not None else []
    kwargs.setdefault("values", values)
    kwargs.setdefault("value", values[0] if len(values) == 1 else None)
    return Cell(row=row, col=col, raw_latex=text, text=text, **kwargs)


def column(index: int, header: str = "", **kwargs) -> Column:
    return Column(index=index, header=header, **kwargs)


def table(columns: list[Column], cells: list[Cell], label: str = "tab:test", **kwargs) -> Table:
    return Table(
        label=label,
        anchor=Anchor(kind="table", dom_id=label),
        columns=columns,
        cells=cells,
        n_rows=max((c.row for c in cells), default=-1) + 1,
        n_cols=len(columns),
        **kwargs,
    )


def context(*tables: Table) -> CheckContext:
    return CheckContext(document=SourceDocument(arxiv_id="0000.00000"), tables=list(tables))


def verdicts(tally: dict[Verdict, int]) -> dict[str, int]:
    return {v.value: n for v, n in tally.items()}


# --------------------------------------------------------------------------
# Check 1 — case 1, the Transformer EN-FR column
# --------------------------------------------------------------------------


def transformer_en_fr() -> Table:
    """The EN-FR column of `tab:wmt-results`, in source order with its blocks.

    Two bolds in one column, each the best of its own block. Ground truth: matches.
    """
    blocks = [
        (0, ["39.2", "39.92", "40.46", "40.56"], None),
        (1, ["40.4", "41.16", "41.29"], "41.29"),
        (2, ["38.1", "41.8"], "41.8"),
    ]
    cells: list[Cell] = []
    row = 0
    for block, values, bold in blocks:
        for text in values:
            cells.append(
                cell(
                    row,
                    0,
                    text,
                    block=block,
                    is_bold=text == bold,
                    bold_source="textbf" if text == bold else None,
                )
            )
            row += 1
    return table(
        [column(0, "EN-FR", metric="BLEU", direction=Direction.HIGHER_IS_BETTER)],
        cells,
        label="tab:wmt-results",
    )


def test_transformer_en_fr_matches_within_blocks():
    findings, reasons, comparisons = bold_extreme.check_table(transformer_en_fr())
    assert findings == []
    assert reasons == []
    assert comparisons == 2  # one bold judged per block

    result = bold_extreme.run(context(transformer_en_fr()))
    assert result.verdict is Verdict.MATCHES
    assert result.reason is None


def test_whole_column_comparison_is_the_false_positive_we_prevent():
    """With block scoping removed the same table reports two bolds in one column.

    This is the naive check the brief specifies, and it is wrong: 41.29 is the best
    ensemble, not a mistake.
    """
    findings, reasons, _ = bold_extreme.check_table(transformer_en_fr(), respect_blocks=False)
    assert findings == []
    assert reasons == [ReasonCode.MULTIPLE_BOLD_IN_COLUMN]


# --------------------------------------------------------------------------
# Check 1 — direction
# --------------------------------------------------------------------------


def resnet_top1(direction: Direction) -> Table:
    """ResNet's top-1 error table: 25.03, the minimum, is bolded."""
    cells = [
        cell(0, 0, "18 layers"),
        cell(0, 1, "27.88"),
        cell(1, 0, "34 layers"),
        cell(1, 1, "25.03", is_bold=True, bold_source="textbf"),
    ]
    return table([column(0, "layers"), column(1, "ResNet", direction=direction)], cells)


def test_lower_is_better_bolded_minimum_matches():
    findings, reasons, comparisons = bold_extreme.check_table(
        resnet_top1(Direction.LOWER_IS_BETTER)
    )
    assert findings == []
    assert reasons == []
    assert comparisons == 1


def test_unknown_direction_is_unverifiable_even_when_the_bold_is_right():
    """Ground truth case 3. The headers are `plain` and `ResNet` — no metric name,
    no arrow. Guessing min happens to be correct here and is still guessing."""
    findings, reasons, comparisons = bold_extreme.check_table(resnet_top1(Direction.UNKNOWN))
    assert findings == []
    assert reasons == [ReasonCode.METRIC_DIRECTION_UNKNOWN]
    assert comparisons == 0

    result = bold_extreme.run(context(resnet_top1(Direction.UNKNOWN)))
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.METRIC_DIRECTION_UNKNOWN


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("Perplexity", Direction.LOWER_IS_BETTER),
        ("Test error (%)", Direction.LOWER_IS_BETTER),
        ("WER", Direction.LOWER_IS_BETTER),
        ("Training cost (FLOPs)", Direction.LOWER_IS_BETTER),
        ("BLEU", Direction.HIGHER_IS_BETTER),
        ("Top-1 accuracy", Direction.HIGHER_IS_BETTER),
        ("Top-1 error", Direction.LOWER_IS_BETTER),
        ("plain", Direction.UNKNOWN),
        ("ResNet", Direction.UNKNOWN),
        ("Ours", Direction.UNKNOWN),
    ],
)
def test_direction_lookup_fallback(header, expected):
    assert bold_extreme.resolve_direction(column(0, header)) is expected


# --------------------------------------------------------------------------
# Check 1 — a genuine divergence, and the unverifiable paths
# --------------------------------------------------------------------------


def test_genuine_divergence_reports_claimed_computed_and_delta():
    cells = [
        cell(0, 0, "84.1", is_bold=True, bold_source="mathbf"),
        cell(1, 0, "87.4"),
        cell(2, 0, "85.0"),
    ]
    t = table([column(0, "Accuracy", direction=Direction.HIGHER_IS_BETTER)], cells)

    findings, reasons, _ = bold_extreme.check_table(t)
    assert reasons == []
    assert len(findings) == 1
    finding = findings[0]
    assert finding.claimed == "84.1"
    assert finding.computed == "87.4"
    assert finding.delta == "-3.3"
    assert finding.anchor.kind == "table_cell"
    assert finding.anchor.dom_id == "tab:test/r0/c0"
    assert finding.anchor.row == 0 and finding.anchor.col == 0
    assert "87.4" in finding.explanation and "higher" in finding.explanation

    assert bold_extreme.run(context(t)).verdict is Verdict.DIVERGES


def test_two_bolds_in_one_block_and_column_is_unverifiable():
    cells = [
        cell(0, 0, "84.1", is_bold=True),
        cell(1, 0, "87.4", is_bold=True),
    ]
    t = table([column(0, "Accuracy", direction=Direction.HIGHER_IS_BETTER)], cells)
    findings, reasons, _ = bold_extreme.check_table(t)
    assert findings == []
    assert reasons == [ReasonCode.MULTIPLE_BOLD_IN_COLUMN]


def test_bold_inside_a_multicolumn_belongs_to_no_column():
    cells = [
        cell(0, 0, "3.3e18", value=3.3e18, is_bold=True, bold_source="boldmath", colspan=2),
        cell(1, 0, "9.6e18", value=9.6e18),
    ]
    t = table(
        [
            column(0, "Training cost", direction=Direction.LOWER_IS_BETTER),
            column(1, "Training cost"),
        ],
        cells,
    )
    findings, reasons, _ = bold_extreme.check_table(t)
    assert findings == []
    assert reasons == [ReasonCode.CELL_SPANS_COLUMNS]


def test_unparsed_table_is_never_judged():
    t = transformer_en_fr()
    t = t.model_copy(update={"parse_warnings": ["could not resolve \\multirow"]})
    findings, reasons, comparisons = bold_extreme.check_table(t)
    assert (findings, reasons, comparisons) == ([], [ReasonCode.TABLE_STRUCTURE_NOT_PARSED], 0)


def test_empty_cells_mean_not_reported_never_zero():
    """An empty cell must not become the minimum of a lower-is-better column."""
    cells = [
        cell(0, 0, "4.2", is_bold=True),
        cell(1, 0, ""),
        cell(2, 0, "5.8"),
    ]
    t = table([column(0, "Perplexity", direction=Direction.LOWER_IS_BETTER)], cells)
    findings, reasons, comparisons = bold_extreme.check_table(t)
    assert findings == []
    assert reasons == []
    assert comparisons == 1


def test_spacer_columns_are_not_compared():
    cells = [
        cell(0, 1, "1.0", is_bold=True),
        cell(1, 1, "9.9"),
    ]
    t = table(
        [column(0, ""), column(1, "", is_spacer=True)],
        cells,
    )
    findings, reasons, comparisons = bold_extreme.check_table(t)
    assert (findings, reasons, comparisons) == ([], [], 0)


def test_bolded_row_label_makes_no_numeric_claim():
    cells = [
        cell(0, 0, "BERT-large", is_bold=True),
        cell(0, 1, "82.1"),
        cell(1, 0, "BERT-base"),
        cell(1, 1, "79.6"),
    ]
    t = table([column(0, "System"), column(1, "GLUE", direction=Direction.HIGHER_IS_BETTER)], cells)
    findings, reasons, comparisons = bold_extreme.check_table(t)
    assert (findings, reasons, comparisons) == ([], [], 0)


def test_bolded_multi_value_cell_is_not_judged():
    """BERT bolds `{\\bf 86.7/85.9}`. A pair has no single value to be the best,
    so check 1 passes over it silently rather than picking one of the two.
    Documented gap: element-wise comparison is a decision for the orchestrator."""
    cells = [
        cell(0, 1, "86.7/85.9", is_bold=True, bold_source="bf"),
        cell(1, 1, "84.6/83.4"),
    ]
    t = table([column(0, "System"), column(1, "MNLI-(m/mm)", direction=Direction.HIGHER_IS_BETTER)], cells)
    findings, reasons, comparisons = bold_extreme.check_table(t)
    assert (findings, reasons, comparisons) == ([], [], 0)


def test_no_bolds_anywhere_is_not_attempted():
    t = table([column(0, "BLEU", direction=Direction.HIGHER_IS_BETTER)], [cell(0, 0, "41.8")])
    assert bold_extreme.run(context(t)).verdict is Verdict.NOT_ATTEMPTED


# --------------------------------------------------------------------------
# Check 3 — case 2, BERT's GLUE table
# --------------------------------------------------------------------------

# System, MNLI-(m/mm), QQP, QNLI, SST-2, CoLA, STS-B, MRPC, RTE, Average
BERT_HEADERS = [
    "System",
    "MNLI-(m/mm)",
    "QQP",
    "QNLI",
    "SST-2",
    "CoLA",
    "STS-B",
    "MRPC",
    "RTE",
    "Average",
]
BERT_ROWS = [
    ("Pre-OpenAI SOTA", "80.6/80.1", "66.1", "82.3", "93.2", "35.0", "81.0", "86.0", "61.7", "74.0"),
    ("BiLSTM+ELMo+Attn", "76.4/76.1", "64.8", "79.8", "90.4", "36.0", "73.3", "84.9", "56.8", "71.0"),
    ("OpenAI GPT", "82.1/81.4", "70.3", "87.4", "91.3", "45.4", "80.0", "82.3", "56.0", "75.1"),
    ("BERT-base", "84.6/83.4", "71.2", "90.5", "93.5", "52.1", "85.8", "88.9", "66.4", "79.6"),
    ("BERT-large", "86.7/85.9", "72.1", "92.7", "94.9", "60.5", "86.5", "89.3", "70.1", "82.1"),
]


def bert_glue(rows=BERT_ROWS, *, pairs_parsed: bool = True) -> Table:
    """`tab:glue_official`, including its second header row of dataset sizes.

    `pairs_parsed=False` is what agent B emits today: a multi-value cell it cannot
    represent becomes value=None plus a table-level parse warning.
    """
    columns = [column(i, header) for i, header in enumerate(BERT_HEADERS)]
    cells = [
        cell(0, i, header, is_header=True, is_bold=header == "Average")
        for i, header in enumerate(BERT_HEADERS)
    ]
    sizes = ["", "392k", "363k", "108k", "67k", "8.5k", "5.7k", "3.5k", "2.5k", "-"]
    cells += [cell(1, i, size, is_header=True) for i, size in enumerate(sizes)]

    for r, values in enumerate(rows, start=2):
        for c, text in enumerate(values):
            if c == 1 and not pairs_parsed:
                cells.append(cell(r, c, "", block=1))
            else:
                cells.append(cell(r, c, text, block=1))
    warnings = [] if pairs_parsed else ["cell 'x/y' holds more than one value"]
    return table(columns, cells, label="tab:glue_official", parse_warnings=warnings)


def test_bert_glue_average_is_over_nine_values_not_eight_columns():
    """The five-false-positives case. Four rows match; BiLSTM is within tolerance."""
    findings, reasons, tally = row_arithmetic.check_table(bert_glue())
    assert reasons == []
    assert verdicts(tally) == {"matches": 4, "within_tolerance": 1}
    assert [f.anchor.row for f in findings] == [3]  # BiLSTM+ELMo+Attn


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Pre-OpenAI SOTA", Verdict.MATCHES),
        ("BiLSTM+ELMo+Attn", Verdict.WITHIN_TOLERANCE),
        ("OpenAI GPT", Verdict.MATCHES),
        ("BERT-base", Verdict.MATCHES),
        ("BERT-large", Verdict.MATCHES),
    ],
)
def test_bert_glue_row_by_row(label, expected):
    row = next(r for r in BERT_ROWS if r[0] == label)
    _, reasons, tally = row_arithmetic.check_table(bert_glue([row]))
    assert reasons == []
    assert verdicts(tally) == {expected.value: 1}


def test_bert_bilstm_tolerance_finding_carries_the_numbers():
    row = next(r for r in BERT_ROWS if r[0] == "BiLSTM+ELMo+Attn")
    findings, _, _ = row_arithmetic.check_table(bert_glue([row]))
    assert len(findings) == 1
    assert findings[0].claimed == "71.0"
    assert findings[0].computed == "70.944"
    assert findings[0].delta == "+0.056"


def test_bert_glue_run_reports_within_tolerance_overall():
    result = row_arithmetic.run(context(bert_glue()))
    assert result.verdict is Verdict.WITHIN_TOLERANCE
    assert result.reason is None
    assert len(result.findings) == 1


def test_unrepresentable_multi_value_cell_is_unverifiable_not_averaged():
    """What agent B emits today: a hole in the row plus a parse warning. Averaging
    the remaining eight columns would produce five false divergences."""
    result = row_arithmetic.run(context(bert_glue(pairs_parsed=False)))
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.TABLE_STRUCTURE_NOT_PARSED
    assert result.findings == []


# --------------------------------------------------------------------------
# Check 3 — the simple paths
# --------------------------------------------------------------------------


def simple_average(values: list[str], stated: str, header: str = "Avg") -> Table:
    columns = [column(0, "Model")] + [column(i + 1, f"T{i}") for i in range(len(values))]
    columns.append(column(len(values) + 1, header))
    cells = [cell(0, 0, "Ours")]
    cells += [cell(0, i + 1, text) for i, text in enumerate(values)]
    cells.append(cell(0, len(values) + 1, stated))
    return table(columns, cells)


def test_row_averaging_to_the_stated_value_matches():
    _, reasons, tally = row_arithmetic.check_table(simple_average(["80.0", "82.0", "81.0"], "81.0"))
    assert reasons == []
    assert verdicts(tally) == {"matches": 1}


@pytest.mark.parametrize("header", ["Avg", "average", "Mean", "Overall", "ALL"])
def test_average_column_headers_are_recognised(header):
    _, _, tally = row_arithmetic.check_table(
        simple_average(["80.0", "82.0", "81.0"], "81.0", header=header)
    )
    assert verdicts(tally) == {"matches": 1}


def test_row_clearly_outside_its_own_range_diverges():
    t = simple_average(["80.0", "82.0", "81.0"], "91.0")
    findings, reasons, tally = row_arithmetic.check_table(t)
    assert verdicts(tally) == {"diverges": 1}
    assert reasons == []
    assert len(findings) == 1
    assert findings[0].claimed == "91.0"
    assert findings[0].computed == "81.000"
    assert findings[0].delta == "+10.000"
    assert findings[0].anchor.dom_id == "tab:test/r0/c4"

    assert row_arithmetic.run(context(t)).verdict is Verdict.DIVERGES


def test_a_plausible_weighting_is_preferred_over_an_accusation():
    """81.9 is not the mean of 80/82/81, but a weighted average would give it.
    We cannot tell the two apart, so we decline to assert it."""
    _, reasons, tally = row_arithmetic.check_table(simple_average(["80.0", "82.0", "81.0"], "81.9"))
    assert verdicts(tally) == {"unverifiable": 1}
    assert reasons == [ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS]


def test_an_ambiguous_average_still_shows_the_user_the_numbers():
    """Declining to assert is not declining to inform. The verdict stays
    unverifiable; the comparison is attached so the reader can judge."""
    t = simple_average(["80.0", "82.0", "84.0", "86.0"], "85.9")
    findings, reasons, tally = row_arithmetic.check_table(t)
    assert verdicts(tally) == {"unverifiable": 1}
    assert reasons == [ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS]

    assert len(findings) == 1
    finding = findings[0]
    assert finding.severity is Severity.LOW
    assert finding.claimed == "85.9"
    assert finding.computed == "83.000"
    assert finding.delta == "+2.900"
    assert finding.anchor.dom_id == "tab:test/r0/c5"
    assert "83.000" in finding.explanation and "weighted" in finding.explanation

    result = row_arithmetic.run(context(t))
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS
    assert len(result.findings) == 1


def test_missing_value_in_the_averaged_range_is_unverifiable():
    t = simple_average(["80.0", "", "81.0"], "80.5")
    _, reasons, tally = row_arithmetic.check_table(t)
    assert verdicts(tally) == {"unverifiable": 1}
    assert reasons == [ReasonCode.NO_NUMERIC_VALUES]


def test_no_average_column_is_not_attempted():
    columns = [column(0, "Model"), column(1, "BLEU")]
    t = table(columns, [cell(0, 0, "Ours"), cell(0, 1, "41.8")])
    assert row_arithmetic.run(context(t)).verdict is Verdict.NOT_ATTEMPTED


def test_cell_values_prefers_the_parsers_field():
    assert row_arithmetic.cell_values(cell(0, 0, "86.7/85.9")) == [86.7, 85.9]
    assert row_arithmetic.cell_values(cell(0, 0, "84.6")) == [84.6]
    assert row_arithmetic.cell_values(cell(0, 0, "")) == []
    # The field wins over the text when the parser read the cell differently.
    odd = Cell(row=0, col=0, raw_latex="", text="86.7/85.9", values=[86.7])
    assert row_arithmetic.cell_values(odd) == [86.7]


def test_cell_values_falls_back_to_strict_slash_parsing():
    """For cells that predate `Cell.values`. Strict: a variance is one value."""
    bare = Cell(row=0, col=0, raw_latex="", text="86.7/85.9")
    assert row_arithmetic.cell_values(bare) == [86.7, 85.9]
    variance = Cell(row=0, col=0, raw_latex="", text="86.7 +- 0.2", value=86.7)
    assert row_arithmetic.cell_values(variance) == [86.7]
    assert row_arithmetic.cell_values(Cell(row=0, col=0, raw_latex="", text="")) == []


# --------------------------------------------------------------------------
# Registry
# --------------------------------------------------------------------------


def test_every_check_module_declares_the_interface():
    for module in (bold_extreme, row_arithmetic):
        assert module.CHECKER_NAME and module.CHECKER_VERSION
        assert module.DISPLAY_NAME and module.DESCRIPTION
        assert callable(module.run)


def test_discovery_tolerates_modules_that_do_not_exist_yet():
    found = {m.CHECKER_NAME for m in registry.discover(("bold_extreme", "not_written_yet"))}
    assert found == {"bold_extreme"}
    assert {"bold_extreme", "row_arithmetic"} <= {m.CHECKER_NAME for m in registry.discover()}


def test_run_all_returns_one_result_per_check_with_ui_metadata():
    results = registry.run_all(context(transformer_en_fr()), ("bold_extreme", "row_arithmetic"))
    assert [r.checker for r in results] == ["bold_extreme", "row_arithmetic"]
    assert all(r.display_name and r.description for r in results)
    assert all(r.duration_ms is not None and r.created_at is not None for r in results)
    assert results[0].verdict is Verdict.MATCHES


def test_a_check_that_raises_becomes_unverifiable_and_does_not_fail_the_run():
    broken = types.ModuleType("broken")
    broken.CHECKER_NAME = "broken"
    broken.CHECKER_VERSION = "0.0.1"
    broken.DISPLAY_NAME = "Broken check"

    def explode(ctx):
        raise RuntimeError("boom")

    broken.run = explode

    result = registry.run_check(broken, context())
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.CHECKER_ERROR
    assert result.checker == "broken"
    assert "RuntimeError" in result.description
