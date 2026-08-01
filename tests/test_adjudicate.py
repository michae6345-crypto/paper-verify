"""Adjudication and the tolerance policy (§14.4).

The band that decides whether a paper is rounded or wrong used to be a literal
inside `checks/row_arithmetic.py`. It is now in `policies/tolerance.yaml`, and the
point of moving it is that these two must stay true together:

  - the policy is a **lift** of the behaviour that was there, not a change to it —
    `GROUND_TRUTH.md` case 2 is the acceptance test and it must still come out
    `within_tolerance`;
  - a checker measures and the adjudicator judges, so nothing in `checks/` names a
    verdict any more.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pv import adjudicate  # noqa: E402
from pv.adjudicate import (  # noqa: E402
    Policy,
    Rule,
    default_policy,
    judge,
    load_policy,
    parse_policy_file,
    result_fingerprint,
)
from pv.checks import bold_extreme, row_arithmetic  # noqa: E402
from pv.models import Anchor, Observation, ReasonCode, Verdict  # noqa: E402

from tests.test_checks_arith import (  # noqa: E402
    bert_glue,
    context,
    simple_average,
    transformer_en_fr,
)

POLICY_PATH = ROOT / "policies" / "tolerance.yaml"


def observation(**measured) -> Observation:
    return Observation(
        claim_id="c1",
        checker="row_arithmetic",
        checker_version="1.0.0",
        status="ok",
        measured=measured,
        provenance=[Anchor(kind="table_cell", dom_id="t/r0/c0")],
    )


# --------------------------------------------------------------------------
# The policy file
# --------------------------------------------------------------------------


def test_the_committed_policy_is_the_one_that_loads():
    policy = default_policy()
    assert policy.version == "1"
    assert policy.default.rule == "reported_precision"
    assert policy.default.min_abs == 0.0
    assert policy.metrics["bleu"] == Rule("reported_precision", min_abs=0.05)
    assert policy.metrics["loss"] == Rule("relative", pct=1.0)
    assert policy.comparative == {"require_variance": True, "min_seeds": 3}


def test_policy_file_round_trips():
    assert load_policy(POLICY_PATH).version == default_policy().version


def test_a_line_the_reader_cannot_parse_raises_rather_than_being_skipped():
    """A policy silently half-read is a tolerance band nobody chose."""
    with pytest.raises(ValueError):
        parse_policy_file("version: 1\n- not a mapping\n")


def test_a_missing_policy_is_an_error_not_a_default():
    with pytest.raises(FileNotFoundError):
        load_policy(ROOT / "policies" / "does-not-exist.yaml")


def test_an_unknown_rule_raises():
    with pytest.raises(ValueError):
        Rule(rule="vibes").band(decimals=[1], reference=1.0)


# --------------------------------------------------------------------------
# Tolerance
# --------------------------------------------------------------------------


def test_reported_precision_is_half_the_last_printed_place():
    """A value written 87.4 carries an implicit +-0.05, because that is what
    printing one decimal place asserts. Derived from the page, not chosen by us."""
    rule = default_policy().default
    assert rule.band(decimals=[1], reference=0.0) == pytest.approx(0.05)
    assert rule.band(decimals=[2], reference=0.0) == pytest.approx(0.005)
    # Averaging, not summing: that is what a mean does to the error it inherits.
    assert rule.band(decimals=[1] * 9, reference=0.0) == pytest.approx(0.05)


def test_min_abs_is_a_floor_not_a_replacement():
    rule = default_policy().metrics["accuracy"]
    assert rule.band(decimals=[3], reference=0.0) == pytest.approx(0.05)
    assert rule.band(decimals=[0], reference=0.0) == pytest.approx(0.5)


def test_relative_rule_scales_with_the_value():
    rule = default_policy().metrics["loss"]
    assert rule.band(decimals=[2], reference=4.0) == pytest.approx(0.04)


def test_metric_lookup_falls_back_to_the_default():
    policy = default_policy()
    assert policy.rule_for(None) is policy.default
    assert policy.rule_for("Average") is policy.default
    assert policy.rule_for("BLEU") is policy.metrics["bleu"]


# --------------------------------------------------------------------------
# Judgement — GROUND_TRUTH.md case 2
# --------------------------------------------------------------------------


def test_bert_bilstm_row_is_within_tolerance_under_the_policy():
    """70.944 against a stated 71.0 is 0.056 off — just outside the +-0.05 the
    one-decimal display implies, and inside it once the printed average's own half
    unit is allowed. Not `matches`, not `diverges`."""
    judgement = judge(
        observation(
            claimed=71.0,
            computed=70.944444444444444,
            value_decimals=[1] * 9,
            claimed_decimals=1,
            metric=None,
        )
    )
    assert judgement.verdict is Verdict.WITHIN_TOLERANCE
    assert judgement.reason is None


def test_bert_rows_that_reproduce_exactly_match():
    for claimed, computed in [(74.0, 74.0), (75.1, 75.1333333), (82.1, 82.0777777)]:
        judgement = judge(
            observation(
                claimed=claimed,
                computed=computed,
                value_decimals=[1] * 9,
                claimed_decimals=1,
                metric=None,
            )
        )
        assert judgement.verdict is Verdict.MATCHES, claimed


def test_the_whole_bert_table_still_comes_out_as_ground_truth_says():
    """End to end through the refactor: four rows match, BiLSTM is within
    tolerance, and nothing on this landmark paper diverges."""
    result = row_arithmetic.run(context(bert_glue()))
    assert result.verdict is Verdict.WITHIN_TOLERANCE
    assert [f.claimed for f in result.findings] == ["71.0"]
    assert [f.computed for f in result.findings] == ["70.944"]
    assert [f.delta for f in result.findings] == ["+0.056"]


def test_a_value_outside_its_rows_range_diverges():
    judgement = judge(
        observation(
            claimed=91.0, computed=81.0, value_decimals=[1] * 3, claimed_decimals=1
        )
    )
    assert judgement.verdict is Verdict.DIVERGES


# --------------------------------------------------------------------------
# The convex-hull rule, kept exactly as it was
# --------------------------------------------------------------------------


def test_a_reachable_weighting_is_unverifiable_not_a_divergence():
    """A weighted mean lies inside the convex hull of the row, so anything in that
    range is reachable and nothing there is ours to assert."""
    judgement = judge(
        observation(
            claimed=81.9,
            computed=81.0,
            value_decimals=[1] * 3,
            claimed_decimals=1,
            ambiguous_reason=ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS.value,
            other_reading="a weighted average",
        )
    )
    assert judgement.verdict is Verdict.UNVERIFIABLE
    assert judgement.reason is ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS


def test_an_unverifiable_average_still_attaches_the_comparison():
    """Declining to assert is not declining to inform. Deliberate, and documented
    in GROUND_TRUTH.md — the reader sees the numbers and decides."""
    result = row_arithmetic.run(context(simple_average(["80.0", "82.0", "84.0", "86.0"], "85.9")))
    assert result.verdict is Verdict.UNVERIFIABLE
    assert result.reason is ReasonCode.AVERAGE_DENOMINATOR_AMBIGUOUS
    assert len(result.findings) == 1
    assert result.findings[0].claimed == "85.9"
    assert result.findings[0].computed == "83.000"
    assert "weighted" in result.findings[0].explanation


# --------------------------------------------------------------------------
# Non-numeric observations
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("outcome", "expected"),
    [
        ("confirmed_absent", Verdict.DIVERGES),
        ("present", Verdict.MATCHES),
        ("confirmed_retracted", Verdict.DIVERGES),
        ("in_good_standing", Verdict.MATCHES),
    ],
)
def test_outcomes_map_to_verdicts(outcome, expected):
    assert judge(observation(outcome=outcome)).verdict is expected


def test_an_outcome_the_adjudicator_does_not_know_raises():
    """Better to fail the check — `registry.run_check` turns it into
    unverifiable/checker_error — than to guess what a checker meant."""
    with pytest.raises(ValueError):
        judge(observation(outcome="probably_fine"))


def test_an_ok_observation_that_measured_nothing_raises():
    with pytest.raises(ValueError):
        judge(observation())


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("not_applicable", Verdict.NOT_ATTEMPTED),
        ("insufficient_data", Verdict.UNVERIFIABLE),
        ("error", Verdict.UNVERIFIABLE),
    ],
)
def test_a_measurement_that_could_not_be_made_is_never_a_divergence(status, expected):
    obs = observation().model_copy(
        update={"status": status, "reason": ReasonCode.NO_NUMERIC_VALUES}
    )
    judgement = judge(obs)
    assert judgement.verdict is expected
    assert judgement.reason is ReasonCode.NO_NUMERIC_VALUES


# --------------------------------------------------------------------------
# Replay
# --------------------------------------------------------------------------


def test_the_same_observation_judged_twice_gives_the_same_verdict():
    obs = observation(claimed=71.0, computed=70.9444, value_decimals=[1] * 9, claimed_decimals=1)
    assert judge(obs) == judge(obs)


def test_a_wider_policy_changes_the_verdict_without_re_running_the_check():
    """The whole point of the split: revise the band, replay the stored
    observation, get a new judgement without re-parsing a single paper."""
    obs = observation(
        claimed=71.0, computed=70.9444, value_decimals=[1] * 9, claimed_decimals=1, metric="bleu"
    )
    wider = Policy(
        version="2",
        default=Rule("reported_precision"),
        metrics={"bleu": Rule("reported_precision", min_abs=0.5)},
        comparative={},
    )
    assert judge(obs).verdict is Verdict.WITHIN_TOLERANCE
    assert judge(obs, wider).verdict is Verdict.MATCHES


# --------------------------------------------------------------------------
# Identity (§14.5)
# --------------------------------------------------------------------------


def test_every_check_result_carries_the_policy_that_judged_it():
    for result in (
        row_arithmetic.run(context(bert_glue())),
        bold_extreme.run(context(transformer_en_fr())),
    ):
        assert result.policy_version == default_policy().version
        assert len(result.fingerprint) == 64


def test_a_check_that_evaluated_no_claim_carries_no_fingerprint():
    """BERT's GLUE table bolds only its `Average` header, so check 1 judged
    nothing there. The policy is still recorded; the fingerprint is not, because
    there is no judgement for it to identify."""
    result = bold_extreme.run(context(bert_glue()))
    assert result.verdict is Verdict.NOT_ATTEMPTED
    assert result.policy_version == default_policy().version
    assert result.fingerprint == ""


def test_the_fingerprint_does_not_depend_on_the_order_claims_were_mined_in():
    a = result_fingerprint(["x", "y"], "c", "1", "1")
    b = result_fingerprint(["y", "x"], "c", "1", "1")
    assert a == b and len(a) == 64


def test_bumping_a_version_changes_every_fingerprint():
    """This is how a backfill is scoped: select the old version, enqueue only those."""
    base = result_fingerprint(["x"], "c", "1", "1")
    assert result_fingerprint(["x"], "c", "2", "1") != base
    assert result_fingerprint(["x"], "c", "1", "2") != base
    assert result_fingerprint(["x"], "c", "1", "1", "abc123") != base


def test_a_checker_that_judged_nothing_has_no_fingerprint():
    """Empty is not a fingerprint. A backfill must never read "we judged nothing"
    as a cache hit."""
    assert result_fingerprint([], "c", "1", "1") == ""


# --------------------------------------------------------------------------
# The rule that governs everything
# --------------------------------------------------------------------------


def test_the_checkers_declare_which_policy_entries_they_read():
    for module in (bold_extreme, row_arithmetic):
        assert isinstance(module.POLICY_KEYS, tuple)
        assert callable(module.applies) and callable(module.observe)
    # Check 1 reads only the default: a per-metric floor would widen what counts as
    # a tie between two printed numbers, which is a statement about the page.
    assert bold_extreme.POLICY_KEYS == ("default",)
    assert set(row_arithmetic.POLICY_KEYS) == {"default", "metrics"}


def test_no_checker_decides_a_verdict_from_a_hardcoded_band():
    """The +-0.05 is gone from the executable source of both table checks. Prose
    may still explain it; code that computes a tolerance may not, because a band
    written in a checker is one nobody can replay a stored result against."""
    for path in (
        ROOT / "backend" / "pv" / "checks" / "row_arithmetic.py",
        ROOT / "backend" / "pv" / "checks" / "bold_extreme.py",
    ):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        literals = [
            node.value
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, float)
        ]
        assert literals == [], f"{path.name} carries a hard-coded band: {literals}"


def test_the_policy_module_is_the_only_place_a_verdict_is_named():
    """§14.1 invariant 2. `Verdict.DIVERGES` appears in a checker only where it
    reads back the adjudicator's answer, never where it decides one."""
    assert adjudicate.judge.__module__ == "pv.adjudicate"
