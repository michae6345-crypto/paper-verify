"""Observation + policy -> verdict (§14.4).

Invariant 2 of §14.1: **checkers observe, the adjudicator judges.** A checker
measures and records provenance; nothing in `checks/` decides `matches` or
`diverges` any more. Everything that turns a measurement into a word about a
researcher's paper is in this file, and everything that decides how close is close
enough is in `policies/tolerance.yaml`.

The payoff is replay. A verdict is `f(claim_content_hash, checker_version,
policy_version, artifact_commit)`, so revising the tolerance band — publicly, under
argument, which will happen — means running `judge` again over stored observations
instead of re-parsing every paper.

The judgement is deliberately generic. It dispatches on what was measured, not on
which checker measured it, so a new check gets adjudicated correctly by declaring
its measurements rather than by adding a branch here.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Sequence

from .fingerprint import fingerprint
from .models import Observation, ReasonCode, Verdict

# --------------------------------------------------------------------------
# The policy file
#
# Parsed here rather than with PyYAML: `backend/pyproject.toml` does not declare
# it, and a policy that loads in development and is missing in CI is the worst of
# both. The grammar accepted is exactly the grammar the file uses, and anything
# outside it raises rather than being skipped — a policy silently half-read is a
# tolerance band nobody chose.
# --------------------------------------------------------------------------

POLICY_FILE = "tolerance.yaml"

_SCALAR = re.compile(r"^([A-Za-z_][\w.-]*)\s*:\s*(.*)$")
_INLINE = re.compile(r"^\{(.*)\}$")


def _value(raw: str) -> object:
    text = raw.strip().strip('"').strip("'")
    if text in ("true", "false"):
        return text == "true"
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        return text


def parse_policy_file(text: str) -> dict:
    """The subset of YAML `tolerance.yaml` uses: two levels, scalars, inline maps."""
    root: dict = {}
    section: dict | None = None
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.split("#", 1)[0].rstrip() if not line.lstrip().startswith("#") else ""
        if not stripped.strip():
            continue
        indented = stripped[0].isspace()
        match = _SCALAR.match(stripped.strip())
        if match is None:
            raise ValueError(f"{POLICY_FILE} line {number}: cannot read {line.strip()!r}")
        key, rest = match.group(1), match.group(2).strip()
        target = section if indented else root
        if target is None:
            raise ValueError(f"{POLICY_FILE} line {number}: indented line outside a section")
        inline = _INLINE.match(rest)
        if inline:
            target[key] = {
                k.strip(): _value(v)
                for k, _, v in (part.partition(":") for part in inline.group(1).split(","))
            }
        elif rest == "":
            section = target[key] = {}
        else:
            target[key] = _value(rest)
    return root


def _search_paths() -> list[Path]:
    override = os.getenv("PV_POLICY_DIR", "").strip()
    here = Path(__file__).resolve()
    return [
        *( [Path(override)] if override else [] ),
        here.parents[2] / "policies",   # repo root, alongside backend/
        here.parents[1] / "policies",   # a packaged copy, if one is ever shipped
    ]


@dataclass(frozen=True)
class Rule:
    """One tolerance entry. `min_abs` is a floor on the band, never a replacement."""

    rule: str = "reported_precision"
    min_abs: float = 0.0
    pct: float = 0.0

    def band(self, *, decimals: list[int], reference: float) -> float:
        """How far a value may sit from its recomputation and still be the same number.

        `reported_precision` averages half a unit in the last place each input was
        printed to — the rounding error the page itself declares. Averaging rather
        than summing is what a mean does to the error it inherits.
        """
        if self.rule == "reported_precision":
            if not decimals:
                return self.min_abs
            width = sum(0.5 * 10**-d for d in decimals) / len(decimals)
        elif self.rule == "relative":
            width = abs(reference) * self.pct / 100.0
        else:
            raise ValueError(f"unknown tolerance rule {self.rule!r}")
        return max(width, self.min_abs)


@dataclass(frozen=True)
class Policy:
    version: str
    default: Rule
    metrics: dict[str, Rule]
    comparative: dict

    def rule_for(self, metric: str | None) -> Rule:
        """The entry a metric reads, falling back to the default.

        Matched on the metric name the parser established, never on words found in
        the header. "Average accuracy" heading a column of BLEU scores would
        otherwise pick up the accuracy floor, and a tolerance nobody chose is how a
        rounding dispute becomes an accusation.
        """
        if not metric:
            return self.default
        return self.metrics.get(metric.strip().lower(), self.default)


def _rule(raw: object) -> Rule:
    if not isinstance(raw, dict):
        raise ValueError(f"{POLICY_FILE}: expected a mapping, got {raw!r}")
    return Rule(
        rule=str(raw.get("rule", "reported_precision")),
        min_abs=float(raw.get("min_abs", 0.0)),
        pct=float(raw.get("pct", 0.0)),
    )


def load_policy(path: Path | None = None) -> Policy:
    """Read the tolerance policy. Raises if it is not there.

    Raising is the right failure: `registry.run_check` turns it into
    `unverifiable / checker_error` on every check, so a deployment that lost the
    policy file reports that it could not judge rather than judging by a default
    nobody committed.
    """
    if path is None:
        for directory in _search_paths():
            candidate = directory / POLICY_FILE
            if candidate.is_file():
                path = candidate
                break
    if path is None or not path.is_file():
        raise FileNotFoundError(
            f"no {POLICY_FILE} in {', '.join(str(p) for p in _search_paths())}"
        )
    raw = parse_policy_file(path.read_text(encoding="utf-8"))
    return Policy(
        version=str(raw.get("version", "")),
        default=_rule(raw.get("default", {})),
        metrics={k.lower(): _rule(v) for k, v in (raw.get("metrics") or {}).items()},
        comparative=dict(raw.get("comparative") or {}),
    )


@lru_cache(maxsize=1)
def default_policy() -> Policy:
    """The committed policy, read once per process."""
    return load_policy()


# --------------------------------------------------------------------------
# Judgement
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Judgement:
    """One claim's verdict, and why if there isn't one. Carries no prose.

    Rendering the sentence a reader sees is the checker's job: the wording depends
    on what was being checked, and choosing words is not deciding.
    """

    verdict: Verdict
    reason: ReasonCode | None = None
    tolerance: float = 0.0


# What a non-numeric observation can conclude. A checker states the outcome it
# measured; this table says what that outcome means. Keeping the mapping here is
# what stops `checks/links.py` from naming a verdict itself.
_OUTCOMES: dict[str, Verdict] = {
    "confirmed_absent": Verdict.DIVERGES,   # a 404/410, confirmed with a GET
    "present": Verdict.MATCHES,
    "confirmed_retracted": Verdict.DIVERGES,
    "in_good_standing": Verdict.MATCHES,
}

_STATUS_VERDICT = {
    "not_applicable": Verdict.NOT_ATTEMPTED,
    "insufficient_data": Verdict.UNVERIFIABLE,
    "error": Verdict.UNVERIFIABLE,
}


def judge(observation: Observation, policy: Policy | None = None) -> Judgement:
    """The verdict `observation` earns under `policy`. Pure.

    Order of operations matters and is the order the checks were argued into:
    a measurement that could not be made is never a divergence; a gap inside the
    rounding the page declares is a match; a gap that some other reading of the
    same row reproduces is unverifiable, with the comparison still attached.
    """
    if observation.status != "ok":
        verdict = _STATUS_VERDICT.get(observation.status, Verdict.UNVERIFIABLE)
        return Judgement(verdict, observation.reason)

    measured = observation.measured
    outcome = measured.get("outcome")
    if outcome is not None:
        if outcome not in _OUTCOMES:
            raise ValueError(f"{observation.checker}: unknown outcome {outcome!r}")
        return Judgement(_OUTCOMES[outcome], observation.reason)

    if "claimed" not in measured or "computed" not in measured:
        raise ValueError(f"{observation.checker}: an ok observation measured nothing")

    policy = policy or default_policy()
    claimed = float(measured["claimed"])
    computed = float(measured["computed"])
    delta = claimed - computed
    rule = policy.rule_for(measured.get("metric"))

    band = rule.band(decimals=list(measured.get("value_decimals") or []), reference=computed)
    if abs(delta) <= band:
        return Judgement(Verdict.MATCHES, None, band)

    # The claim is printed to a precision of its own and hides half a unit inside
    # it. Allowing that, and only that, is what separates "within tolerance" from
    # "matches" — the paper is not wrong, it is rounded.
    claimed_decimals = measured.get("claimed_decimals")
    slack = (
        rule.band(decimals=[int(claimed_decimals)], reference=claimed)
        if claimed_decimals is not None
        else 0.0
    )
    if slack and abs(delta) <= band + slack:
        return Judgement(Verdict.WITHIN_TOLERANCE, None, band + slack)

    # Some other reading of the same numbers reproduces the stated value. There is
    # a reading under which the paper is right, so there is nothing here we can
    # assert — and declining to assert is not declining to inform: the checker
    # still attaches the comparison.
    ambiguous = measured.get("ambiguous_reason")
    if ambiguous:
        return Judgement(Verdict.UNVERIFIABLE, ReasonCode(ambiguous), band)

    return Judgement(Verdict.DIVERGES, None, band)


def judge_all(
    observations: list[Observation], policy: Policy | None = None
) -> list[Judgement]:
    policy = policy or default_policy()
    return [judge(observation, policy) for observation in observations]


# --------------------------------------------------------------------------
# Identity (§14.5)
# --------------------------------------------------------------------------


def result_fingerprint(
    claim_ids: Sequence[str],
    checker: str,
    checker_version: str,
    policy_version: str,
    artifact_commit: str | None = None,
) -> str:
    """The identity of one checker's result over a set of claims.

    §14.5 fingerprints a single (claim, checker) judgement. A `CheckResult` today
    summarises every claim a checker evaluated, so the claim component is a digest
    of those claims' content hashes — order-independent, because the set of claims
    a paper makes does not depend on the order they were mined in.

    Empty is not a fingerprint. A checker that evaluated nothing gets "", so a
    backfill never mistakes "we judged nothing" for a cache hit.
    """
    if not claim_ids:
        return ""
    digest = sha256("\x00".join(sorted(set(claim_ids))).encode("utf-8")).hexdigest()
    return fingerprint(digest, checker, checker_version, policy_version, artifact_commit)


__all__ = [
    "Judgement",
    "POLICY_FILE",
    "Policy",
    "Rule",
    "default_policy",
    "judge",
    "judge_all",
    "load_policy",
    "parse_policy_file",
    "result_fingerprint",
]
