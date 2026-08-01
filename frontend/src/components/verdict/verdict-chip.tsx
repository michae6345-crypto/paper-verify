"use client";

import { motion, useReducedMotion } from "motion/react";

import type { Verdict } from "@/types/run-report";
import { VERDICT_COLOR, VERDICT_LABEL } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import { VerdictGlyph } from "./verdict-glyph";

/**
 * Glyph plus word, e.g. `⁄ diverges` (§5.4). The chip resolves with a
 * scale 0.96→1 over 140ms, easeOut — no bounce, no spring overshoot (§6).
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
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 t-emph",
        className,
      )}
      style={{
        borderColor: "var(--chrome-line)",
        backgroundColor: "var(--chrome-panel)",
        color: VERDICT_COLOR[verdict],
      }}
    >
      <VerdictGlyph verdict={verdict} size={12} />
      {VERDICT_LABEL[verdict]}
    </motion.span>
  );
}
