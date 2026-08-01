import type { Amendment } from "@/types/run-report";

/**
 * The most sensitive copy in the product.
 *
 * An author reading this has just been told in public that their paper's numbers
 * do not add up. Every string here is written for that reader.
 *
 * The rules, from §7 and CLAUDE.md:
 *   - Sentence case, active voice.
 *   - The vocabulary is `matches`, `within tolerance`, `diverges`,
 *     `unverifiable`. A finding is never an error, a problem, a bug, or
 *     misconduct.
 *   - "Contest this finding" is a normal action, not a complaint form. Nothing
 *     here apologises, and nothing here asks an author to justify wanting to
 *     respond.
 *   - We name what *we* did — what we compared, what we read — rather than what
 *     the author did. The finding is a claim we are making, and the response is
 *     to our claim.
 */

export const CONTEST_ACTION = "Contest this finding";

export const CONTEST_INTRO =
  "Say what this check got wrong. A person reads every statement before it is " +
  "shown on this page, and once it is shown it appears in your words, with the " +
  "finding still on the record next to it.";

export const STATEMENT_LABEL = "What we got wrong";
export const STATEMENT_PLACEHOLDER =
  "For example: the two values are in different blocks of the table, separated by a rule.";

export const CORRECTED_LABEL = "The value you consider correct";
export const CORRECTED_HINT = "Optional. Write it as it appears in the paper.";

export const SUBMIT = "Send";
export const CANCEL = "Cancel";
export const SENDING = "Sending";

export const RECHECK_ACTION = "Check this claim again";

/**
 * Shown once a statement is recorded.
 *
 * It promises exactly what happens and nothing more. In particular it does not
 * say the statement is now published, because it is not: there is no auth layer,
 * so every statement lands in the §14.8 review queue and a person reads it before
 * it appears. An earlier draft of this string said "shown with this finding from
 * now on", which was a promise the gate does not keep — and a false promise made
 * to someone who has just been told in public that their numbers do not add up is
 * about the worst sentence this product could print.
 *
 * No correction is promised, no retraction, and no timeline.
 */
export const CONTEST_RECEIVED =
  "Recorded. A person will read your statement before it is shown on this page. " +
  "The finding stays as it is either way.";

export const HISTORY_TITLE = "Amendments";

/**
 * Deliberately not "statements from the paper's authors". There is no auth layer
 * (`backend/pv/amendments/submitter.py`), so we cannot say who sent one — and
 * writing an attribution we cannot stand behind onto a page carrying a named
 * researcher's name is the failure this whole flow exists to avoid. A person
 * reads each one before it appears here, which is what makes the section
 * publishable at all, and the sentence says so.
 */
export const HISTORY_BLURB =
  "Statements about findings in this report, oldest first, each one read by a " +
  "person before it was shown. An amendment never removes a finding; both stay " +
  "on the record.";

export const HISTORY_EMPTY = "No statements have been made about this report.";

/**
 * What each status means, in a reader's terms.
 *
 * `resolved` is carefully not a verdict about who was right. It says only that
 * the comparison is no longer reported — which is the one thing we can state
 * without judging the paper, and the distinction an author has every reason to
 * care about.
 */
export const STATUS_LABEL: Record<NonNullable<Amendment["status"]>, string> = {
  open: "Awaiting a recheck",
  recheck_requested: "Checked again, still reported",
  resolved: "No longer reported",
  withdrawn: "Withdrawn by the author",
};

export function statusLabel(amendment: Amendment): string {
  return STATUS_LABEL[amendment.status ?? "open"];
}

/** "1 April 2026", or empty when the record carries no timestamp. */
export function whenSubmitted(amendment: Amendment): string {
  if (!amendment.submitted_at) return "";
  const at = new Date(amendment.submitted_at);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
