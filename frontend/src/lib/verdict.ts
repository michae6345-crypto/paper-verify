import type { ReasonCode, Verdict } from "@/types/run-report";

/**
 * The verdict vocabulary is fixed (§7): matches, within tolerance, diverges,
 * unverifiable. `not_attempted` is in the §10 enum but has no §7 label — it
 * renders as "not checked", matching the §5.5 section name. It is a normal
 * outcome, not a failure.
 *
 * Never call a finding an error, a problem, a bug, or misconduct.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  matches: "matches",
  within_tolerance: "within tolerance",
  diverges: "diverges",
  unverifiable: "unverifiable",
  not_attempted: "not checked",
};

/** The CSS custom property carrying each verdict's semantic colour (§3). */
export const VERDICT_COLOR: Record<Verdict, string> = {
  matches: "var(--v-matches)",
  within_tolerance: "var(--v-tolerance)",
  diverges: "var(--v-diverges)",
  unverifiable: "var(--v-unverifiable)",
  not_attempted: "var(--v-pending)",
};

/**
 * A run's own ordering when we summarise it — most consequential first, so the
 * glyph strip on the submit screen reads as a fingerprint rather than a shuffle.
 */
export const VERDICT_RANK: Record<Verdict, number> = {
  diverges: 0,
  within_tolerance: 1,
  unverifiable: 2,
  not_attempted: 3,
  matches: 4,
};

/**
 * Human-readable label for every ReasonCode. The raw enum value is never shown
 * to the user. Sentence case, active voice, states what happened (§7).
 *
 * `next` is the thing the user can do about it, where there is one. §13 is
 * explicit that `llm_disabled` and `rate_limited` must read as ordinary states
 * with a clear next step — the app stays fully usable with the model layer off.
 */
export const REASON: Record<ReasonCode, { label: string; next?: string; retryable?: boolean }> = {
  no_code_repository: {
    label: "No code repository",
    next: "Point the run at a repository to check the results against code.",
  },
  dataset_not_public: {
    label: "Dataset is not public",
  },
  table_structure_not_parsed: {
    label: "Table structure not parsed",
  },
  no_latex_source: {
    label: "No LaTeX source on arXiv",
    next: "Upload the PDF instead.",
  },
  llm_disabled: {
    label: "Structure extraction is switched off",
    next: "Turn the model layer on to run this check. Every other check runs without it.",
  },
  rate_limited: {
    label: "Model rate limit reached",
    next: "The limit resets shortly.",
    retryable: true,
  },
  metric_direction_unknown: {
    label: "Metric direction unknown",
  },
  multiple_bold_in_column: {
    label: "More than one bolded value in the column",
  },
  cell_spans_columns: {
    label: "Cell spans more than one column",
  },
  no_numeric_values: {
    label: "No numbers to compare",
  },
  network_error: {
    label: "The network did not respond",
    retryable: true,
  },
  average_denominator_ambiguous: {
    label: "Unclear which values the average covers",
  },
  checker_error: {
    label: "The check did not finish",
    retryable: true,
  },
  reference_not_indexed: {
    label: "Reference not indexed",
  },
  cell_has_multiple_values: {
    label: "Cell holds more than one value",
  },
  no_applicable_claims: {
    label: "Nothing in this paper for this check",
  },
  // Added with the contract's INVALID_PAPER_ID. Deliberately distinct from
  // "No LaTeX source on arXiv", which is a real paper that ships no LaTeX.
  invalid_paper_id: {
    label: "Not a well-formed arXiv identifier",
    next: "Check the id and submit it again.",
  },
};

export function reasonLabel(code: ReasonCode | null | undefined): string | null {
  if (!code) return null;
  return REASON[code]?.label ?? null;
}
