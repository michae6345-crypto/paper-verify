"""Check 3 — an average column does not equal the mean of its row.

Three things make this harder than it looks, and all three push towards
`unverifiable`:

  - **The denominator of an average is not knowable from the row alone.** BERT's
    GLUE table (`fixtures/GROUND_TRUTH.md`, case 2) averages *nine* values across
    *eight* data columns, because the `MNLI-(m/mm)` cells hold a slash-separated
    pair. Read as eight, all five rows appear to diverge by 0.5-0.76 — five false
    accusations against a landmark paper. So every plausible reading of the row is
    tried before any verdict, and an ambiguous denominator is `unverifiable`.
  - **Tolerance is not a constant.** A row printed to one decimal place carries
    +-0.05 of rounding error per value; propagated through the mean that stays
    +-0.05, and the printed average hides half a unit of its own on top. The band
    is derived from displayed precision, never hard-coded — and since §14.4 it is
    not written here at all: `policies/tolerance.yaml` holds it, versioned, so a
    revision replays over stored observations instead of re-running the corpus.
  - **Weighted averages exist and are undetectable from the table.** If some
    weighting of the row's values reproduces the stated number, an arithmetic mean
    and a weighted mean cannot be told apart here.

`diverges` is therefore a high bar: no plausible reading reproduces the value, and
the gap clears rounding by a clear margin. This module measures; `pv.adjudicate`
decides which of those four words applies.

The claim is the stated average cell: writing 71.0 under a column headed "Average"
asserts that 71.0 is the mean of that row.

Zero model calls.
"""

from __future__ import annotations

import re

from ..adjudicate import Judgement, Policy, default_policy, judge, result_fingerprint
from ..models import (
    Cell,
    CheckContext,
    CheckResult,
    Claim,
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
    decimals,
    fmt,
    index_cells,
    resolve,
    table_claims,
)

CHECKER_NAME = "row_arithmetic"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Average columns match their row"
DESCRIPTION = (
    "Checks that a column labelled average, mean or overall equals the mean of the "
    "other numbers in the same row, to the precision they were printed at."
)
# The band that used to be a literal here. `metrics` is read because an average
# column can name its metric, and some metrics are not stable to the digit they
# are quoted at.
POLICY_KEYS: tuple[str, ...] = ("default", "metrics")

# Header words that mark a column as the average of the others in its row.
# `all` is deliberately absent: it labels a grouping — "all layers", "all tasks",
# "all data" — far more often than an aggregate. ELMo's `table:alternate_weights`
# heads two sub-columns "All layers", meaning all layers of the biLM, and reading
# them as averages produced six false divergences (GROUND_TRUTH.md case 4).
_STRONG_AVERAGE_WORDS = {"avg", "average", "mean"}
# Weaker evidence: a real word in its own right. Only counts in the position an
# average actually occupies — the end of the row, after the values it averages.
_WEAK_AVERAGE_WORDS = {"overall"}

_AMBIGUOUS_REASON = ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def average_keyword(header: str, metric: str | None = None) -> str | None:
    """"strong", "weak" or None, from the header alone. Whole words only."""
    words = _words(f"{metric or ''} {header}")
    if words & _STRONG_AVERAGE_WORDS:
        return "strong"
    if words & _WEAK_AVERAGE_WORDS:
        return "weak"
    return None


def is_average_column(header: str, metric: str | None = None) -> bool:
    """Whether the header alone names an aggregate. `average_columns` is the real
    test — it also weighs grouping and position, which need the whole table."""
    return average_keyword(header, metric) == "strong"


def _grouped_columns(table: Table) -> set[int]:
    """Columns sitting under a shared `\\multicolumn` header.

    Sub-columns of a group are alternatives being compared — ELMo's two
    "All layers" columns are lambda=1 and lambda=0.001 — never an aggregate of
    their neighbours. Read from the header cells' colspan, which is the
    `\\multicolumn` itself rather than an inference about it.
    """
    grouped: set[int] = set()
    for cell in table.cells:
        if cell.is_header and cell.colspan > 1:
            grouped.update(range(cell.col, cell.col + cell.colspan))
    return grouped


def _last_data_column(table: Table) -> int | None:
    """Index of the rightmost column carrying numbers."""
    indices = [
        column.index
        for column in table.columns
        if not column.is_spacer and any(cell_values(c) for c in table.column_cells(column.index))
    ]
    return max(indices) if indices else None


def average_columns(table: Table) -> set[int]:
    """Which columns state an average of their row.

    Three signals, all deterministic: the header word, whether the column is one
    of several under a shared `\\multicolumn` (then it is a grouping, not an
    aggregate), and position — an average sits after the values it averages.
    """
    grouped = _grouped_columns(table)
    last = _last_data_column(table)

    found: set[int] = set()
    for column in table.columns:
        if column.is_spacer or column.index in grouped:
            continue
        keyword = average_keyword(column.header, column.metric)
        if keyword is None:
            continue
        if keyword == "weak" and column.index != last:
            continue
        found.add(column.index)
    return found


def _data_columns(table: Table, average_cols: set[int]) -> list[int]:
    """Columns holding the numbers an average would be taken over.

    A column counts as data when at least half of its non-header cells carry
    values, which excludes model-name and citation columns without guessing at
    their content.

    A column that is blank throughout also counts, so that a row with a hole in it
    comes out `unverifiable` rather than quietly averaging the columns that remain.
    A column that is decorative rather than unreported is the parser's `is_spacer`.
    """
    data: list[int] = []
    for column in table.columns:
        if column.is_spacer or column.index in average_cols:
            continue
        cells = table.column_cells(column.index)
        if not cells:
            continue
        numeric = [c for c in cells if cell_values(c)]
        blank = [c for c in cells if not (c.text or "").strip()]
        if (numeric and len(numeric) * 2 >= len(cells)) or len(blank) == len(cells):
            data.append(column.index)
    return data


# A reading is a list of (value, decimals it was printed to). The decimals travel
# with the value because the tolerance is derived from them, and the derivation
# belongs to the policy rather than to this file.
Reading = list[tuple[float, int]]


def _mean(reading: Reading) -> float:
    return sum(value for value, _ in reading) / len(reading)


def _readings(cells: list[Cell]) -> list[Reading]:
    """The plausible ways to read a row, most defensible first.

    1. Every value in the row, multi-value cells counted once per value. This is
       what BERT does.
    2. One value per cell.

    Both are principled readings of the whole row, so either may produce `matches`.
    """
    per_cell = [
        [(v, decimals(cell.text, cell.value)) for v in cell_values(cell)] for cell in cells
    ]
    all_values = [pair for group in per_cell for pair in group]
    first_only = [group[0] for group in per_cell]
    readings = [all_values]
    if first_only != all_values:
        readings.append(first_only)
    return readings


def _subset_readings(cells: list[Cell]) -> list[Reading]:
    """Readings over part of the row — one cell, or one value, left out.

    These can only downgrade a divergence to `unverifiable`: if dropping a column
    reproduces the stated number, we cannot know which columns were averaged, and
    that ambiguity is not the paper's mistake.
    """
    out: list[Reading] = []
    for reading in _readings(cells):
        if len(reading) < 3:
            continue
        for i in range(len(reading)):
            out.append(reading[:i] + reading[i + 1 :])
    return out


# --------------------------------------------------------------------------
# Which claims this check evaluates
# --------------------------------------------------------------------------


def applies(claim: Claim, ctx: CheckContext) -> bool:
    """A single-valued cell in an average column claims to be its row's mean.

    A cell spanning columns states an average of nothing in particular, and a cell
    holding several numbers states no single average, so neither is a claim this
    check can evaluate.
    """
    if claim.kind != "body_number":
        return False
    located = resolve(claim, index_cells(ctx.tables))
    if located is None:
        return False
    table, cell = located
    return _is_subject(table, cell, average_columns(table))


def _is_subject(table: Table, cell: Cell, average_cols: set[int]) -> bool:
    return (
        not cell.is_header
        and cell.col in average_cols
        and cell.value is not None
        and cell.colspan == 1
    )


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
    table: Table, claims: list[Claim] | None = None, *, policy: Policy | None = None
) -> tuple[list[Observation], list[ReasonCode]]:
    """Recompute every stated average in one table.

    Returns (observations, table-level reasons). The reasons list carries only what
    belongs to the table rather than to a claim — an unparsed table is a fact about
    the table.

    The policy is read here as well as in the adjudicator, and only for
    *measurement*: whether some subset of the row reproduces the stated number, and
    whether the number lies inside the row's own range, are questions about
    arithmetic that need a tolerance to ask. Confirming a divergence by
    recomputation is §14.1's invariant 3. The verdict still comes from `judge`.
    """
    if table.parse_warnings:
        # Includes the case where the parser could not represent a multi-value
        # cell. A hole in the row is not a licence to average what remains.
        return [], [ReasonCode.TABLE_STRUCTURE_NOT_PARSED]

    average_cols = average_columns(table)
    if not average_cols:
        return [], []

    if claims is None:
        claims = table_claims(table)
    subjects: list[tuple[Claim, Cell]] = []
    index = index_cells([table])
    for claim in claims:
        located = resolve(claim, index)
        if located is None or claim.kind != "body_number":
            continue
        if _is_subject(table, located[1], average_cols):
            subjects.append((claim, located[1]))
    # Row order, then column order: the order the table is read in.
    subjects.sort(key=lambda pair: (pair[1].row, pair[1].col))
    if not subjects:
        return [], []

    policy = policy or default_policy()
    columns = {column.index: column for column in table.columns}
    data_cols = _data_columns(table, average_cols)

    by_row: dict[int, dict[int, Cell]] = {}
    for cell in table.cells:
        if not cell.is_header:
            by_row.setdefault(cell.row, {})[cell.col] = cell

    observations: list[Observation] = []
    for claim, stated in subjects:
        cells = by_row.get(stated.row, {})
        peers = [cells.get(col) for col in data_cols]
        usable = [c for c in peers if c is not None and c.colspan == 1 and cell_values(c)]
        if len(usable) != len(peers) or len(usable) < 2:
            # An empty cell means "not reported". With a hole in the row we cannot
            # know what the average was taken over.
            observations.append(
                _observation(
                    claim,
                    status="insufficient_data",
                    reason=ReasonCode.NO_NUMERIC_VALUES,
                    detail="A value this average would be taken over is not reported.",
                )
            )
            continue

        column = columns.get(stated.col)
        metric = column.metric if column is not None else None
        rule = policy.rule_for(metric)

        avg_places = decimals(stated.text, stated.value)
        places = max(avg_places, *(decimals(c.text, c.value) for c in usable))

        # Best of the principled whole-row readings.
        readings = _readings(usable)
        best = min(readings, key=lambda r: abs(stated.value - _mean(r)))
        computed = _mean(best)
        band = rule.band(decimals=[d for _, d in best], reference=computed)

        # Is there a reading under which the paper is right? Either some subset of
        # the row reproduces the number, or some weighting of it does — a weighted
        # mean lies inside the convex hull of the row, so anything in that range is
        # reachable and nothing there is ours to assert.
        subset_match = any(
            abs(stated.value - _mean(subset))
            <= rule.band(decimals=[d for _, d in subset], reference=_mean(subset))
            for subset in _subset_readings(usable)
        )
        all_values = [value for value, _ in readings[0]]
        in_range = min(all_values) - band <= stated.value <= max(all_values) + band

        observations.append(
            _observation(
                claim,
                status="ok",
                measured={
                    "claimed": stated.value,
                    "computed": computed,
                    "unit": "abs",
                    "value_decimals": [d for _, d in best],
                    "claimed_decimals": avg_places,
                    "metric": metric,
                    "places": places,
                    "n_values": len(best),
                    "reproducible_by_subset": subset_match,
                    "within_row_range": in_range,
                    **(
                        {
                            "ambiguous_reason": _AMBIGUOUS_REASON.value,
                            "other_reading": (
                                "averaging a subset of the columns"
                                if subset_match
                                else "a weighted average"
                            ),
                        }
                        if subset_match or in_range
                        else {}
                    ),
                },
            )
        )

    return observations, []


def observe(claim: Claim, ctx: CheckContext) -> Observation:
    """The single-claim entry point of the checker protocol (§14.3).

    An average can only be recomputed from the rest of its row, so this resolves
    the claim's table and runs the batched form over it.
    """
    located = resolve(claim, index_cells(ctx.tables))
    if located is None:
        return _observation(claim, status="not_applicable")
    table, cell = located
    if not _is_subject(table, cell, average_columns(table)):
        return _observation(claim, status="not_applicable")
    for observation in observe_table(table, table_claims(table))[0]:
        if observation.claim_id == claim.content_hash:
            return observation
    return _observation(
        claim,
        status="insufficient_data",
        reason=ReasonCode.TABLE_STRUCTURE_NOT_PARSED,
        detail="This average could not be placed in a row of its table.",
    )


# --------------------------------------------------------------------------
# Findings — the prose a reader sees. Rendering, not judging.
# --------------------------------------------------------------------------


def _finding(observation: Observation, judgement: Judgement) -> Finding | None:
    """The comparison, in the paper's own numbers.

    Note the `unverifiable` branch: declining to assert is not declining to
    inform. When some other reading of the row would give the stated value we say
    so and still show both numbers, because the reader can weigh what we cannot.
    """
    if judgement.verdict is Verdict.MATCHES or observation.status != "ok":
        return None

    m = observation.measured
    claimed, computed = float(m["claimed"]), float(m["computed"])
    delta = claimed - computed
    detail = int(m["places"]) + 2
    claimed_text = fmt(claimed, int(m["claimed_decimals"]))
    anchor = observation.provenance[0]

    if judgement.verdict is Verdict.WITHIN_TOLERANCE:
        return Finding(
            severity=Severity.LOW,
            claimed=claimed_text,
            computed=fmt(computed, detail),
            delta=f"{delta:+.{detail}f}",
            anchor=anchor,
            explanation=(
                f"The stated average {claimed_text} is {abs(delta):.{detail}f} "
                f"from the mean of its row, {fmt(computed, detail)} — just "
                "outside the rounding implied by the printed precision."
            ),
        )

    if judgement.verdict is Verdict.UNVERIFIABLE:
        return Finding(
            severity=Severity.LOW,
            claimed=claimed_text,
            computed=fmt(computed, detail),
            delta=f"{delta:+.{detail}f}",
            anchor=anchor,
            explanation=(
                f"Stated {claimed_text}; the unweighted mean of the row is "
                f"{fmt(computed, detail)}. Nothing states how the average was "
                f"taken, and {m['other_reading']} would give the stated value, so "
                "this cannot be called a divergence."
            ),
        )

    return Finding(
        severity=Severity.HIGH,
        claimed=claimed_text,
        computed=fmt(computed, detail),
        delta=f"{delta:+.{detail}f}",
        anchor=anchor,
        explanation=(
            f"The stated average {claimed_text} lies outside the range of the "
            f"values in its row, which mean {fmt(computed, detail)}."
        ),
    )


def _judge_table(
    table: Table, claims: list[Claim] | None = None, claim_ids: list[str] | None = None
) -> tuple[list[Finding], list[ReasonCode], dict[Verdict, int]]:
    policy = default_policy()
    observations, reasons = observe_table(table, claims, policy=policy)
    findings: list[Finding] = []
    tally: dict[Verdict, int] = {}
    if claim_ids is not None:
        claim_ids += [observation.claim_id for observation in observations]
    for observation in observations:
        judgement = judge(observation, policy)
        tally[judgement.verdict] = tally.get(judgement.verdict, 0) + 1
        if judgement.reason is not None:
            reasons.append(judgement.reason)
        finding = _finding(observation, judgement)
        if finding is not None:
            findings.append(finding)
    return findings, reasons, tally


def check_table(table: Table) -> tuple[list[Finding], list[ReasonCode], dict[Verdict, int]]:
    """Examine one table. Returns (findings, reasons, count of rows per verdict)."""
    return _judge_table(table)


def run(ctx: CheckContext) -> CheckResult:
    """Evaluate the average-column claims this check applies to.

    Claims come from `ctx.claims` when the caller mined them and from `ctx.tables`
    when it did not; both paths run the same producer, so the run is identical
    either way.
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
    tally: dict[Verdict, int] = {}

    for table in ctx.tables:
        claims = supplied.get(table.anchor.dom_id, []) if ctx.claims else None
        table_findings, table_reasons, table_tally = _judge_table(table, claims, claim_ids)
        findings.extend(table_findings)
        reasons.extend(table_reasons)
        for verdict, count in table_tally.items():
            tally[verdict] = tally.get(verdict, 0) + count

    reason = None
    if tally.get(Verdict.DIVERGES):
        verdict = Verdict.DIVERGES
    elif tally.get(Verdict.WITHIN_TOLERANCE):
        verdict = Verdict.WITHIN_TOLERANCE
    elif tally.get(Verdict.MATCHES):
        verdict = Verdict.MATCHES
    elif reasons:
        verdict = Verdict.UNVERIFIABLE
        reason = (
            ReasonCode.TABLE_STRUCTURE_NOT_PARSED
            if ReasonCode.TABLE_STRUCTURE_NOT_PARSED in reasons
            else reasons[0]
        )
    else:
        # No average column anywhere — there was nothing for this check to do.
        verdict = Verdict.NOT_ATTEMPTED

    policy = default_policy()
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
    "average_columns",
    "average_keyword",
    "cell_anchor",
    "cell_values",
    "check_table",
    "is_average_column",
    "observe",
    "observe_table",
    "run",
]
