import type { ReasonCode } from "@/types/run-report";

/**
 * Every unverifiable row says why, in a sentence a researcher would recognise.
 *
 * `lib/verdict.ts` already carries a short label per code — "Table structure not
 * parsed" — which is the right length for a chip and the wrong length for the
 * only thing a row has to say. About half of all real rows land in this group,
 * so the sentence is the row, and it is written in the reader's terms rather
 * than the system's: what stopped the check, and what that means for the number
 * they were looking at.
 *
 * The raw enum is never printed. A code with no sentence here falls back to the
 * shared label rather than to its own name.
 *
 * Tone is deliberately flat. This group is an honest result, not a warning — a
 * paper with no repository and an unparseable table is a normal paper, and the
 * copy must not read as a shortfall in it (§5.5, CLAUDE.md).
 */
export const REASON_SENTENCE: Record<ReasonCode, string> = {
  no_code_repository:
    "The paper links no code repository, so there is nothing to check the numbers against.",
  dataset_not_public: "The dataset is not public, so these values cannot be recomputed.",
  table_structure_not_parsed:
    "This table is not machine-readable. Its rows and columns could not be recovered from the source, so no value in it was compared.",
  no_latex_source: "arXiv holds no LaTeX source for this paper, only a PDF.",
  llm_disabled:
    "Structure extraction is switched off for this run. Every check that works without a model still ran.",
  rate_limited:
    "The model service reached its rate limit before this claim. The limit resets shortly, and re-running picks it up.",
  metric_direction_unknown:
    "Nothing in the column header says whether higher or lower is better, so there is no best value to compare against.",
  multiple_bold_in_column:
    "More than one value is bolded in this block of the column, so there is no single claim to compare.",
  cell_spans_columns:
    "This value spans several columns, so it belongs to no one column to be compared within.",
  no_numeric_values: "There are no numbers here to compare.",
  network_error:
    "The network did not answer while this was being checked. Running it again may resolve it.",
  average_denominator_ambiguous:
    "It is not clear which values this average covers, so recomputing it would be a guess.",
  checker_error: "The check did not finish, so it has nothing to report.",
  reference_not_indexed:
    "This reference is in neither Crossref nor OpenAlex, so its existence could not be confirmed either way.",
  cell_has_multiple_values:
    "This cell holds more than one number, so there is no single value to compare.",
  no_applicable_claims: "This paper contains nothing that this check applies to.",
  invalid_paper_id: "That is not a well-formed arXiv identifier.",
};

export function reasonSentence(code: ReasonCode | null | undefined): string | null {
  if (!code) return null;
  return REASON_SENTENCE[code] ?? null;
}
