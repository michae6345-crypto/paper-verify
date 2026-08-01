import type { CheckResult } from "@/types/run-report";

/**
 * Two fields the contract has and the generated types do not.
 *
 * `backend/pv/models.py` declares `CheckResult.policy_version` and
 * `CheckResult.fingerprint`, and `fixtures/reports/run-report.schema.json`
 * carries both — but `src/types/run-report.ts` was generated before they landed
 * and has not been regenerated since. That file is generated, never
 * hand-written, and it is not this workstream's to edit (OWNERSHIP.md), so the
 * fields are read through here instead of being typed in by hand.
 *
 * `npm run types:generate` removes the need for this module entirely. It is a
 * shim over a stale artifact, not a place to put new fields.
 */
type ContractExtras = {
  policy_version?: string;
  fingerprint?: string;
};

/**
 * Which tolerance policy produced this verdict.
 *
 * §5.4 and UI_PLAN.md both insist this appears on every discrepancy row, where
 * it looks like internal detail. It is not: it is what lets an author argue with
 * a specific tolerance rule instead of with the verdict, and that argument is
 * the point of the amendment flow. Shown as "not versioned" when the checker
 * left it empty — which is honest about a check whose policy is still implicit,
 * and never invents a version number.
 */
export function policyVersion(check: CheckResult): string {
  const value = (check as CheckResult & ContractExtras).policy_version;
  return value && value.trim() !== "" ? value : "";
}

export function fingerprint(check: CheckResult): string {
  const value = (check as CheckResult & ContractExtras).fingerprint;
  return value && value.trim() !== "" ? value : "";
}
