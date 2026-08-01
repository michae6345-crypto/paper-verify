import type { CheckResult } from "@/types/run-report";
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

export type Provenance = "extracted" | "inferred";

/**
 * §9's "Needs a model?" column, by checker name. Checks 1, 2, 3 and 6 —
 * bold_extreme, dead_links, row_arithmetic, citation_existence — call no model
 * at all, which is the entire first release. The three that do are listed here
 * so the state is driven by which check produced the row, not by a flag someone
 * has to remember to set.
 */
const MODEL_ASSISTED = new Set([
  "abstract_vs_table", // §9 check 4 — matching abstract numbers to cells
  "missing_variance", // §9 check 5 — claim detection
  "baseline_fidelity", // §9 check 7 — retrieval
]);

/**
 * A model that never ran resolved nothing.
 *
 * `abstract_vs_table` is model-assisted and, with the model layer off, returns
 * `llm_disabled` without calling anything. The row it produces says "we did not
 * run this", which is a deterministic statement about the run, so it is
 * EXTRACTED. Marking it INFERRED would attribute a model's judgement to a row no
 * model touched — the same lossy narrowing this codebase keeps producing, in a
 * new place.
 */
const NO_MODEL_RAN = new Set(["llm_disabled", "rate_limited"]);

/**
 * The contract has no provenance field, so this is derived. `CheckResult` would
 * be the natural home for one — see the final report. Until then the optional
 * read below means a future field wins the moment it exists, without touching
 * any row code.
 */
export function provenanceOf(check: CheckResult): Provenance {
  const declared = (check as { provenance?: string }).provenance;
  if (declared === "inferred" || declared === "extracted") return declared;
  if (!MODEL_ASSISTED.has(check.checker)) return "extracted";
  if (check.reason && NO_MODEL_RAN.has(check.reason)) return "extracted";
  return "inferred";
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
