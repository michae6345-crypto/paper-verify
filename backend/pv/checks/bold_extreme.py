"""Check 1 — a bolded value is not the best value in its column.

The naive form of this check ("the bolded cell must be the maximum of its whole
column") false-positives on real papers. See CLAUDE.md: tables are segmented into
rule-delimited blocks (single models / ensembles / ours) and each block bolds its
own winner, so the Transformer paper legitimately carries two bolds in one column.

This module therefore:
  - compares only within a `Cell.block`,
  - skips `Column.is_spacer` columns,
  - honours `Column.direction` (a bolded minimum is correct for perplexity, FID,
    WER, MSE, loss, error rate, training cost, ...),
  - and returns `unverifiable` with a `ReasonCode` for every situation it cannot
    settle deterministically. It never guesses.

The claim is the bolded cell: bolding a number asserts that it is the best in its
column. `applies` selects those claims; `observe` measures the bold against the
other values in its block; `pv.adjudicate` decides whether the gap is a divergence
or a tie at the precision the table was printed to. Nothing here names a verdict.

Zero model calls.
"""

from __future__ import annotations

import re
from collections import defaultdict

from ..adjudicate import Judgement, default_policy, judge_all, result_fingerprint
from ..models import (
    Cell,
    CheckContext,
    CheckResult,
    Claim,
    Column,
    Direction,
    Finding,
    Observation,
    ReasonCode,
    Severity,
    Table,
    Verdict,
)
from ._cells import (
    cell_anchor,
    cell_values,
    column_header,
    decimals,
    fmt,
    index_cells,
    resolve,
    table_claims,
)

CHECKER_NAME = "bold_extreme"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Bolded value is the best in its block"
DESCRIPTION = (
    "Checks that each bolded number is the best value in its column, comparing only "
    "within the same rule-delimited block of the table."
)
# Only the default rule. A per-metric floor (`min_abs`) would widen what counts as a
# tie between two printed numbers, and the tie here is a statement about the page —
# 41.29 and 41.30 are the same number to two decimals — not about how stable the
# metric is. Reading the metrics table here would let a policy entry silently
# withdraw a comparison the table plainly invites.
POLICY_KEYS: tuple[str, ...] = ("default",)

# Order in which competing reasons are reported when a check produced several.
# Structural failures outrank interpretive ones: if the table did not parse, that
# is the more useful thing to tell the reader.
_REASON_PRIORITY = (
    ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
    ReasonCode.CELL_SPANS_COLUMNS,
    ReasonCode.CELL_HAS_MULTIPLE_VALUES,
    ReasonCode.MULTIPLE_BOLD_IN_COLUMN,
    ReasonCode.METRIC_DIRECTION_UNKNOWN,
)

# Curated fallback used only when the column header carries no arrow. Matched as
# whole words against the normalised header, lower-is-better first: "top-1 error"
# is lower-is-better even though "top-1" alone would suggest otherwise.
_LOWER_IS_BETTER = (
    "perplexity", "ppl", "fid", "wer", "cer", "per", "der", "eer", "ece",
    "mse", "rmse", "mae", "nll", "bpc", "bpd",
    "loss", "error", "err", "regret", "violation",
    "cost", "flops", "latency", "runtime", "memory",
)
_HIGHER_IS_BETTER = (
    "bleu", "rouge", "meteor", "chrf", "ter", "cider", "spice",
    "accuracy", "acc", "f1", "em", "auc", "auroc", "map", "mrr", "ndcg",
    "precision", "recall", "iou", "miou", "dice", "psnr", "ssim",
    "correlation", "pearson", "spearman", "score", "reward", "win",
)


def pick_reason(reasons: list[ReasonCode]) -> ReasonCode | None:
    for candidate in _REASON_PRIORITY:
        if candidate in reasons:
            return candidate
    return reasons[0] if reasons else None


# --------------------------------------------------------------------------
# Metric direction
# --------------------------------------------------------------------------


def resolve_direction(column: Column) -> Direction:
    """Direction of "better" for a column, deterministically.

    1. What the parser established (arrows in the header are the usual source).
    2. A curated metric-name lookup.
    3. Otherwise UNKNOWN — never assume "higher is better".
    """
    if column.direction is not Direction.UNKNOWN:
        return column.direction

    words = set(re.findall(r"[a-z0-9]+", f"{column.metric or ''} {column.header}".lower()))
    if words & set(_LOWER_IS_BETTER):
        return Direction.LOWER_IS_BETTER
    if words & set(_HIGHER_IS_BETTER):
        return Direction.HIGHER_IS_BETTER
    return Direction.UNKNOWN


# --------------------------------------------------------------------------
# Which claims this check evaluates
# --------------------------------------------------------------------------


def applies(claim: Claim, ctx: CheckContext) -> bool:
    """A bolded table cell claims to be the best value in its column.

    An unbolded cell asserts nothing this check can test, and a cell in a spacer
    column is layout rather than data. A claim that does not resolve against
    `ctx.tables` cannot be located, so it cannot be checked — §14.3 discards it.
    """
    if claim.kind != "body_number":
        return False
    located = resolve(claim, index_cells(ctx.tables))
    if located is None:
        return False
    table, cell = located
    return _is_subject(table, cell)


def _is_subject(table: Table, cell: Cell) -> bool:
    if cell.is_header or not cell.is_bold:
        return False
    for column in table.columns:
        if column.index == cell.col:
            return not column.is_spacer
    return True


# --------------------------------------------------------------------------
# Observation
# --------------------------------------------------------------------------


def _observation(
    claim: Claim,
    *,
    status: str,
    measured: dict | None = None,
    reason: ReasonCode | None = None,
    detail: str = "",
) -> Observation:
    return Observation(
        claim_id=claim.content_hash,
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        status=status,  # type: ignore[arg-type]
        measured=measured or {},
        provenance=[claim.anchor],
        reason=reason,
        detail=detail,
    )


def observe_table(
    table: Table, claims: list[Claim] | None = None, *, respect_blocks: bool = True
) -> tuple[list[Observation], list[ReasonCode], int]:
    """Measure every bolded cell in one table against the others in its block.

    Returns (observations, table-level reasons, comparisons made). One observation
    per claim; the reasons list carries the ones that belong to a *group* of cells
    rather than to any single claim — "two bolds in this column" is a fact about
    the column, and reporting it once per bold would overstate it.

    `respect_blocks=False` compares across the whole column and is wrong for real
    papers — it exists so the test suite can demonstrate the false positive that
    block scoping prevents. Production callers must leave it True.
    """
    if table.parse_warnings:
        # A table we could not fully read is not a table we may judge. This reason
        # is about the table, not about a claim, which is why it has no observation.
        return [], [ReasonCode.TABLE_STRUCTURE_NOT_PARSED], 0

    if claims is None:
        claims = table_claims(table)
    by_dom_id = {c.anchor.dom_id: c for c in claims}
    base = table.anchor.dom_id or table.label or "table"

    def claim_for(cell: Cell) -> Claim | None:
        return by_dom_id.get(f"{base}/r{cell.row}/c{cell.col}")

    columns = {column.index: column for column in table.columns}
    observations: list[Observation] = []
    reasons: list[ReasonCode] = []
    comparisons = 0

    # (block, col) -> cells. Header cells never participate.
    groups: dict[tuple[int, int], list[Cell]] = defaultdict(list)
    for cell in table.cells:
        if cell.is_header:
            continue
        column = columns.get(cell.col)
        if column is not None and column.is_spacer:
            continue
        groups[(cell.block if respect_blocks else 0, cell.col)].append(cell)

    for (_, col), cells in sorted(groups.items()):
        column = columns.get(col) or Column(index=col)
        bolds = [c for c in cells if c.is_bold]
        if not bolds:
            continue

        def declined(
            candidates: list[Cell], reason: ReasonCode, detail: str
        ) -> list[Observation]:
            """One observation per claim in the group; the reason recorded once."""
            reasons.append(reason)
            out = []
            for cell in candidates:
                claim = claim_for(cell)
                if claim is not None:
                    out.append(
                        _observation(
                            claim, status="insufficient_data", reason=reason, detail=detail
                        )
                    )
            return out

        spanning = [c for c in bolds if c.colspan > 1]
        if spanning:
            # A bolded \multicolumn belongs to no single column, so there is no
            # column to be the best of.
            observations += declined(
                spanning,
                ReasonCode.CELL_SPANS_COLUMNS,
                "This cell spans more than one column, so it belongs to no single one.",
            )
            bolds = [c for c in bolds if c.colspan == 1]
            if not bolds:
                continue

        if any(len(cell_values(c)) > 1 for c in cells):
            # BERT bolds `{\bf 86.7/85.9}`: a pair has no single value to be the
            # best of. The same applies when a *peer* holds a pair — comparing the
            # bold against the single-valued cells alone would silently narrow the
            # column. Widening it instead would let a peer's second value convict a
            # paper whose convention only ever compares first values, so we decline
            # and say that we declined.
            observations += declined(
                bolds,
                ReasonCode.CELL_HAS_MULTIPLE_VALUES,
                "A cell in this column holds more than one number.",
            )
            continue

        # A bolded label or a bolded cell with no parseable number makes no
        # numeric claim; there is nothing to compare.
        bolds = [c for c in bolds if c.value is not None and claim_for(c) is not None]
        if not bolds:
            continue

        if len(bolds) > 1:
            observations += declined(
                bolds,
                ReasonCode.MULTIPLE_BOLD_IN_COLUMN,
                "More than one value is bolded in this block of the column.",
            )
            continue

        direction = resolve_direction(column)
        if direction is Direction.UNKNOWN:
            observations += declined(
                bolds,
                ReasonCode.METRIC_DIRECTION_UNKNOWN,
                "Nothing in the header says whether a higher or lower value is better.",
            )
            continue

        # Empty cells mean "not reported", never zero, so they are excluded.
        peers = [c for c in cells if c.value is not None and c.colspan == 1]
        bold = bolds[0]
        best_cell = (
            max(peers, key=lambda c: c.value)
            if direction is Direction.HIGHER_IS_BETTER
            else min(peers, key=lambda c: c.value)
        )
        comparisons += 1

        places = max(decimals(c.text, c.value) for c in peers)
        claim = claim_for(bold)
        assert claim is not None  # filtered above
        observations.append(
            _observation(
                claim,
                status="ok",
                measured={
                    "claimed": bold.value,
                    "computed": best_cell.value,
                    "unit": "abs",
                    # Two values that agree to the precision they were printed at
                    # are a tie, so the band comes from the page: see Rule.band.
                    "value_decimals": [places],
                    "metric": None,
                    "direction": direction.value,
                    "places": places,
                    "header": column.header or column.metric or "",
                    "row": bold.row,
                    "col": bold.col,
                },
            )
        )

    return observations, reasons, comparisons


def observe(claim: Claim, ctx: CheckContext) -> Observation:
    """The single-claim entry point of the checker protocol (§14.3).

    `observe_table` is the batched form and the one `run` uses; a bolded cell can
    only be measured against its neighbours, so both go through the same code.
    """
    located = resolve(claim, index_cells(ctx.tables))
    if located is None or not _is_subject(*located):
        return _observation(claim, status="not_applicable")
    table, _ = located
    for observation in observe_table(table, table_claims(table))[0]:
        if observation.claim_id == claim.content_hash:
            return observation
    return _observation(
        claim,
        status="insufficient_data",
        reason=ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
        detail="This cell could not be placed in a block of its column.",
    )


# --------------------------------------------------------------------------
# Findings — the prose a reader sees. Rendering, not judging.
# --------------------------------------------------------------------------


def _finding(observation: Observation, judgement: Judgement) -> Finding | None:
    if judgement.verdict is not Verdict.DIVERGES:
        return None
    m = observation.measured
    places = int(m["places"])
    better = "higher" if m["direction"] == Direction.HIGHER_IS_BETTER.value else "lower"
    anchor = observation.provenance[0]
    return Finding(
        severity=Severity.MEDIUM,
        claimed=fmt(m["claimed"], places),
        computed=fmt(m["computed"], places),
        delta=f"{m['claimed'] - m['computed']:+.{places}f}",
        anchor=anchor,
        explanation=(
            f"{fmt(m['claimed'], places)} is bolded, but "
            f"{fmt(m['computed'], places)} in the same block of this column "
            f"is {better}."
        ),
    )


def check_table(
    table: Table, *, respect_blocks: bool = True
) -> tuple[list[Finding], list[ReasonCode], int]:
    """Examine one table. Returns (findings, reasons, comparisons_made)."""
    observations, reasons, comparisons = observe_table(
        table, respect_blocks=respect_blocks
    )
    findings = [
        finding
        for observation, judgement in zip(observations, judge_all(observations))
        if (finding := _finding(observation, judgement)) is not None
    ]
    return findings, reasons, comparisons


def run(ctx: CheckContext) -> CheckResult:
    """Evaluate the body-number claims this check applies to.

    Claims are taken from `ctx.claims` when the caller mined them and derived from
    `ctx.tables` when it did not. Both paths run the same producer
    (`_cells.table_claims`), so a run is identical either way — the orchestrator
    supplying claims changes where they come from, never what is checked.
    """
    index = index_cells(ctx.tables)
    supplied: dict[str, list[Claim]] = {}
    for claim in ctx.claims:
        if claim.kind != "body_number":
            continue
        located = resolve(claim, index)
        if located is None:
            continue  # §14.3: cannot be located, so cannot be checked.
        supplied.setdefault(located[0].anchor.dom_id, []).append(claim)

    findings: list[Finding] = []
    reasons: list[ReasonCode] = []
    claim_ids: list[str] = []
    comparisons = 0
    policy = default_policy()

    for table in ctx.tables:
        claims = supplied.get(table.anchor.dom_id, []) if ctx.claims else None
        observations, table_reasons, made = observe_table(table, claims)
        findings += [
            finding
            for observation, judgement in zip(observations, judge_all(observations, policy))
            if (finding := _finding(observation, judgement)) is not None
        ]
        claim_ids += [observation.claim_id for observation in observations]
        reasons += table_reasons
        comparisons += made

    if findings:
        verdict, reason = Verdict.DIVERGES, None
    elif comparisons:
        verdict, reason = Verdict.MATCHES, None
    elif reasons:
        verdict, reason = Verdict.UNVERIFIABLE, pick_reason(reasons)
    else:
        # No bolded numbers anywhere — there was nothing for this check to do.
        verdict, reason = Verdict.NOT_ATTEMPTED, None

    return CheckResult(
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        policy_version=policy.version,
        fingerprint=result_fingerprint(
            claim_ids, CHECKER_NAME, CHECKER_VERSION, policy.version
        ),
        verdict=verdict,
        reason=reason,
        findings=findings,
        display_name=DISPLAY_NAME,
        description=DESCRIPTION,
    )


__all__ = [
    "CHECKER_NAME",
    "CHECKER_VERSION",
    "DESCRIPTION",
    "DISPLAY_NAME",
    "POLICY_KEYS",
    "applies",
    "cell_anchor",
    "cell_values",
    "check_table",
    "column_header",
    "decimals",
    "fmt",
    "observe",
    "observe_table",
    "pick_reason",
    "resolve_direction",
    "run",
]
