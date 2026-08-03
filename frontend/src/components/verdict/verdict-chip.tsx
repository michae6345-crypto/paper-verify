"use client";

import { motion, useReducedMotion } from "motion/react";

import type { Verdict } from "@/types/run-report";
import { VERDICT_COLOR, VERDICT_LABEL } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import { VerdictGlyph } from "./verdict-glyph";

/**
 * Glyph plus word, e.g. `⁄ diverges` (§5.4). The chip resolves with a
 * scale 0.96→1 over 140ms, easeOut — no bounce, no spring overshoot (§6).
 *
 * The word used to be set in the verdict's own colour, which is where this chip
 * failed its own rule. `--v-diverges` on `--chrome-panel` is 3.44:1, and this is
 * the largest, most-read statement of a verdict in the product. The five colours
 * are semantic and fixed, so the chip changed instead: the word is
 * `--chrome-text` at 13:1, and the colour moves to the glyph and to a 2px rule
 * down the leading edge — both graphics, both over the 3:1 floor they answer to.
 *
 * §12 is better served, not worse. Shape, word, and colour all carry the verdict
 * now, and none of the three is doing it alone.
 */
export function VerdictChip({
  verdict,
  className,
  animate = true,
}: {
  verdict: Verdict;
  className?: string;
  animate?: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.span
      initial={animate ? { opacity: 0, scale: reduced ? 1 : 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0.001 : 0.14, ease: [0, 0, 0.2, 1] }}
      className={cn("inline-flex items-center gap-2 border px-2.5 py-1.5 t-emph", className)}
      style={{
        borderRadius: "var(--radius-panel)",
        borderColor: "var(--chrome-line)",
        borderInlineStartWidth: "2px",
        borderInlineStartColor: VERDICT_COLOR[verdict],
        backgroundColor: "var(--chrome-base)",
        color: "var(--chrome-text)",
      }}
    >
      <VerdictGlyph verdict={verdict} size={12} />
      {VERDICT_LABEL[verdict]}
    </motion.span>
  );
}
