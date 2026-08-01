import type { CheckResult, Provenance } from "@/types/run-report";
import { cn } from "@/lib/utils";

/**
 * Where a row's structure came from: read out of the source, or resolved by a
 * model.
 *
 * CLAUDE.md's rule is that a model never produces a verdict — models extract
 * structure only, and every verdict is computed by deterministic Python from
 * that structure. That distinction is invisible in the numbers, so the row has
 * to carry it. A reader must be able to tell, without clicking, whether the
 * thing being compared was lifted from the LaTeX or matched by a model.
 *
 * NOT A COLOUR PAIR (UI_PLAN.md). EXTRACTED is a solid 1px-bordered chip;
 * INFERRED is the same chip with a 45° hairline hatch in `--provenance-line`,
 * and the word spelled out either way. A second colour system would argue with
 * the verdict colours and would vanish in greyscale; fill and texture do not.
 */

export type { Provenance };

/**
 * `CheckResult.provenance` is a contract field, so the row simply reads it.
 *
 * It was derived from the checker's name before the field existed. Two things
 * that derivation had to know are now the backend's to state, and both are worth
 * keeping written down because they are what makes the field mean anything:
 *
 *   - Checks 1, 2, 3 and 6 — bold_extreme, row_arithmetic, dead_links,
 *     citation_existence — call no model at all, which is the entire first
 *     release. Nothing in a validated paper is INFERRED today.
 *   - A model-assisted check that returned `llm_disabled` or `rate_limited` is
 *     EXTRACTED. Nothing was resolved by a model: the row says "we did not run
 *     this", which is a deterministic statement about the run. Calling it
 *     INFERRED would attribute a model's judgement to a row no model touched, and
 *     would misdescribe how we reached the answer — the same lossy narrowing this
 *     codebase keeps producing, in a new place.
 *
 * The field is optional in the generated types because it carries a default, so
 * a report serialised before it landed still reads as EXTRACTED. That is the
 * right default and not a guess: every check in those reports is one of the four
 * that call no model.
 */
export function provenanceOf(check: CheckResult): Provenance {
  return check.provenance ?? "extracted";
}

const HATCH =
  "repeating-linear-gradient(45deg, transparent 0 3px, var(--provenance-line) 3px 4px)";

export const PROVENANCE_TITLE: Record<Provenance, string> = {
  extracted: "Read straight from the paper's source. No model was involved.",
  inferred: "A model matched this claim to its value. The comparison itself is still arithmetic.",
};

export function ProvenanceChip({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  const inferred = provenance === "inferred";
  return (
    <span
      title={PROVENANCE_TITLE[provenance]}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[4px] border px-1.5 py-[2px]",
        className,
      )}
      style={{
        borderColor: "var(--provenance-line)",
        // The hatch is the whole signal, so it sits on the chip itself rather
        // than behind the text, which stays fully legible at 11px.
        backgroundImage: inferred ? HATCH : undefined,
        backgroundColor: inferred ? "var(--chrome-base)" : "var(--chrome-raised)",
        fontSize: "11px",
        lineHeight: 1.2,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--chrome-dim)",
      }}
    >
      <span
        style={{
          // Keeps the word off the hatch without a second surface: a tight
          // inset of the chip's own base colour.
          background: inferred ? "var(--chrome-base)" : undefined,
          paddingInline: inferred ? "3px" : undefined,
        }}
      >
        {inferred ? "Inferred" : "Extracted"}
      </span>
      <span className="sr-only">
        {" "}
        — {PROVENANCE_TITLE[provenance]}
      </span>
    </span>
  );
}
