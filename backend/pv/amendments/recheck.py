"""Re-run one contested claim, not the paper (§14.5).

An author contests a finding. The honest response is to run the check again and
say what it produces this time. The dishonest-by-accident response is to re-fetch
the tarball, re-parse eight `.tex` files, and re-run four checks — which takes an
arXiv request we are rate-limited on, and which can move findings the author never
contested. §14.5 exists precisely so that neither is necessary:

    Re-running a paper looks up fingerprints first and only executes the misses.

So a recheck is a cache lookup before it is anything else:

1.  The contested finding names a checker and the version it ran at. Compare that
    against the version of the checker module *on disk now*.
2.  Same version, same policy — the fingerprint resolves, and §14.5's invariant
    says the answer is already stored. `verdict = f(claim, checker_version,
    policy_version, artifact_commit)`, so executing would reproduce the row we
    already have. Report the hit; run nothing.
3.  Different version — a miss. Execute exactly one check, over the document and
    tables the run already holds in its persisted state. No fetch, no re-parse,
    and no other check is touched.

**A recheck never writes a verdict.** It reads the run's state and returns a fresh
`CheckResult` to the caller; it does not append to `RunState.results`, and the
stored report is byte-identical afterwards. The run is the record of what we found
when we looked; a recheck is a second look, and both have to remain legible as
separate events. Only the amendment log gains a row.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..checks import registry
from ..models import CheckContext, CheckResult, Finding
from ..orchestrator import Orchestrator, RunState
from .identity import finding_fingerprint


@dataclass(frozen=True)
class RecheckOutcome:
    """What a second look produced.

    `still_found` is the field an author is waiting on, and it is deliberately
    three-valued through `result`: `still_found=False` with a result means the
    check ran and no longer makes this finding; `still_found=False` without one
    means we could not run it and are saying so rather than reporting a clearance
    we did not earn.
    """

    # False when the version on disk matches the version the finding ran at, so
    # §14.5 says the stored answer is the answer and nothing was executed.
    executed: bool
    # True when the contested judgement is still produced. None when unknown.
    still_found: bool | None
    # The check as it stands now. None when the finding could not be located.
    result: CheckResult | None
    # Identity of that result (§14.5). "" when the checker evaluated no claims.
    result_fingerprint: str
    # The fingerprint the contested finding now carries, when it is still made.
    # It differs from the contested one exactly when the checker or policy moved.
    current_finding_fingerprint: str | None
    # One sentence, §7 vocabulary, safe to show an author verbatim.
    note: str

    @property
    def located(self) -> bool:
        return self.result is not None


class FindingNotInRun(LookupError):
    """No finding in this run carries that fingerprint.

    Not necessarily an error about the client: a checker improved since the
    amendment was filed changes every fingerprint under it, which is the
    mechanism working. The caller decides whether that is a 404 or a note.
    """


def _index_of(state: RunState, fingerprint_hex: str) -> tuple[int, CheckResult, Finding]:
    for index, check in enumerate(state.results):
        for finding in check.findings:
            if finding_fingerprint(check, finding) == fingerprint_hex:
                return index, check, finding
    raise FindingNotInRun(fingerprint_hex)


def _live_version(plan_name: str) -> str:
    module = registry.discover((plan_name,))[0]
    return str(getattr(module, "CHECKER_VERSION", ""))


def recheck_finding(
    orchestrator: Orchestrator, run_id: str, fingerprint_hex: str
) -> RecheckOutcome:
    """Look up, and execute only on a miss. Raises `FindingNotInRun`.

    `RunNotFound` propagates from `orchestrator.state`.
    """
    state = orchestrator.state(run_id)
    index, check, contested = _index_of(state, fingerprint_hex)

    # The plan holds the name the run asked for; `CheckResult.checker` holds the
    # name the module reports, and the two differ (`links` -> `dead_links`).
    # Position is the reliable correspondence: results are appended in plan order.
    plan_name = state.plan[index] if index < len(state.plan) else check.checker

    if _live_version(plan_name) == check.checker_version:
        # §14.5 cache hit. Same claim, same checker version, same policy, so the
        # verdict is by definition the one already stored. Saying "we re-ran it"
        # here would be a claim about work we did not do.
        return RecheckOutcome(
            executed=False,
            still_found=True,
            result=check,
            result_fingerprint=check.fingerprint,
            current_finding_fingerprint=fingerprint_hex,
            note=(
                f"This check has not changed since the run, so it produces the same "
                f"result. It is recorded at {check.checker} v{check.checker_version}, "
                f"policy {check.policy_version or 'not versioned'}."
            ),
        )

    if state.document is None:
        # A run that terminated before ingest has nothing to re-read. It also has
        # no findings, so this is unreachable in practice — but returning a
        # cleared finding on a missing document is the exact shape of defect this
        # codebase keeps producing, so it is closed explicitly.
        return RecheckOutcome(
            executed=False,
            still_found=None,
            result=None,
            result_fingerprint="",
            current_finding_fingerprint=None,
            note="The source for this run is no longer available, so it could not be checked again.",
        )

    ctx = CheckContext(
        document=state.document,
        tables=state.checkable_tables,
        claims=state.claims,
        llm_enabled=state.options.llm_enabled,
    )
    fresh = registry.run_check(registry.discover((plan_name,))[0], ctx)
    still = _same_finding(contested, fingerprints_in_result(fresh))

    return RecheckOutcome(
        executed=True,
        still_found=still is not None,
        result=fresh,
        result_fingerprint=fresh.fingerprint,
        current_finding_fingerprint=still,
        note=(
            f"Checked again at {fresh.checker} v{fresh.checker_version}. "
            + (
                "The same comparison is still reported."
                if still is not None
                else "This comparison is no longer reported."
            )
        ),
    )


def fingerprints_in_result(check: CheckResult) -> dict[str, Finding]:
    return {finding_fingerprint(check, f): f for f in check.findings}


def _same_finding(old: Finding, current: dict[str, Finding]) -> str | None:
    """The fingerprint the contested finding carries in the fresh result, if it is
    still made.

    Matched on anchor and numbers rather than on fingerprint, because a version
    bump changes every fingerprint under a checker — comparing fingerprints would
    report every improved check as having cleared every finding it still makes,
    which is the worst available failure mode: a false all-clear sent to an author
    who was right to be told the numbers disagreed.
    """
    for fingerprint_hex, finding in current.items():
        if (
            finding.anchor.dom_id == old.anchor.dom_id
            and finding.claimed == old.claimed
            and finding.computed == old.computed
        ):
            return fingerprint_hex
    return None


__all__ = ["FindingNotInRun", "RecheckOutcome", "recheck_finding"]
