"use client";

import { motion } from "motion/react";

import type { StreamRow } from "@/hooks/use-check-stream";
import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { ROW_STAGGER_MS } from "@/lib/stream";
import { VERDICT_LABEL } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

/**
 * One check in the run rail (§5.3): glyph, check name, right-aligned status.
 *
 * States:
 *   running   name in --chrome-text, a 1px indeterminate line under the row
 *   complete  verdict glyph in its semantic colour, plus a count
 *
 * §5.3's `pending` state is not reachable here by design — the rail never
 * renders a row before its result has started arriving.
 *
 * Entrance is §6's only stagger in the product: opacity 0→1, y 4→0, 180ms
 * easeOut, 60ms between rows that arrive together.
 */
export function CheckRow({
  row,
  selected,
  onSelect,
  id,
}: {
  row: StreamRow;
  selected: boolean;
  onSelect: () => void;
  id: string;
}) {
  // The gate, not `motion`'s `useReducedMotion`. It decides this row's `initial`
  // offset, which is an attribute React will not patch during hydration.
  const reduced = useReducedMotionGate();
  const { check, state } = row;
  const running = state === "running";
  const findings = check.findings ?? [];

  const status = running
    ? "running"
    : findings.length > 0
      ? `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`
      : VERDICT_LABEL[check.verdict];

  return (
    <motion.button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      initial={{ opacity: 0, y: reduced ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0.001 : 0.18,
        ease: [0, 0, 0.2, 1],
        delay: reduced ? 0 : (row.batchIndex * ROW_STAGGER_MS) / 1000,
      }}
      className={cn(
        "relative flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors",
        running && "run-sweep",
      )}
      style={{
        background: selected ? "var(--chrome-raised)" : "transparent",
        // The same 2px accent rule the selected ledger row carries. The two
        // panes select different things, but a reader learns one mark for "this
        // is the one you picked" and it holds across the product.
        boxShadow: selected ? "inset 2px 0 0 0 var(--focus)" : undefined,
        transitionDuration: "var(--dur-fast)",
      }}
    >
      <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <VerdictGlyph
          verdict={running ? "not_attempted" : check.verdict}
          pending={running}
          size={12}
        />
      </span>

      <span className="min-w-0 flex-1 t-body" style={{ color: "var(--chrome-text)" }}>
        {check.display_name || check.checker}
      </span>

      {/* The status used to be set in VERDICT_COLOR whenever the check produced
          findings. It reads at 3.44:1 for `diverges` on this panel, which is
          under the 4.5:1 floor for text — and the verdict colours are semantic
          and fixed, so the text is what gives way. Nothing is lost: the glyph
          two columns left already carries the verdict in both shape and colour,
          and this string counts findings rather than naming a verdict. */}
      <span
        className="mt-[1px] shrink-0 t-body whitespace-nowrap"
        style={{ fontSize: "12px", color: "var(--chrome-dim)" }}
      >
        {status}
      </span>
    </motion.button>
  );
}
