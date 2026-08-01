"use client";

import { motion, useReducedMotion } from "motion/react";

import type { StreamRow } from "@/hooks/use-check-stream";
import { ROW_STAGGER_MS } from "@/lib/stream";
import { VERDICT_COLOR, VERDICT_LABEL } from "@/lib/verdict";
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
  const reduced = useReducedMotion();
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

      <span
        className="mt-[1px] shrink-0 t-body whitespace-nowrap"
        style={{
          fontSize: "12px",
          color: running
            ? "var(--chrome-dim)"
            : findings.length > 0
              ? VERDICT_COLOR[check.verdict]
              : "var(--chrome-dim)",
        }}
      >
        {status}
      </span>
    </motion.button>
  );
}
