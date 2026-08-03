"use client";

import { motion } from "motion/react";

import { VERDICT_LABEL } from "@/lib/verdict";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { cn } from "@/lib/utils";
import { SiglumSlot } from "@/components/gutter/siglum-mark";
import { Derivation } from "./derivation";
import { reasonSentence } from "./reasons";
import { ProvenanceChip } from "./provenance";
import type { LedgerRowData } from "./groups";

/**
 * One claim in the ledger.
 *
 * A discrepancy row shows everything §5.4 requires **without a click**: the
 * claim as written, where in the paper it sits, the two numbers and their
 * difference, which check produced it, and which tolerance policy that check was
 * running under. "Explain" opens the derivation; it never hides the evidence
 * behind itself.
 *
 * An unverifiable row's whole content is the sentence saying what stopped the
 * check. It is styled exactly like the others — no warning colour, no alert
 * shape, no apology. Roughly half of all real rows land here and they are an
 * honest result, not a defect in the run (§5.5).
 */

function ValuePair({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="t-num" style={{ color: "var(--chrome-text)" }}>
        {value.replace(/^-/, "−")}
      </span>
      <span className="t-num" style={{ fontSize: "11px", color: "var(--chrome-faint)" }}>
        {label}
      </span>
    </span>
  );
}

export function LedgerRow({
  row,
  instance,
  selected,
  expanded,
  reduced,
  onSelect,
  onToggle,
}: {
  row: LedgerRowData;
  /** The ledger renders twice — a pane and a sheet — so element ids are scoped. */
  instance: string;
  selected: boolean;
  expanded: boolean;
  reduced: boolean;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
}) {
  const { finding, check } = row;
  const sentence = reasonSentence(row.reason);
  // §5.4 and UI_PLAN.md both insist this appears on every discrepancy row, where
  // it looks like internal detail. It is not: it is what lets an author argue
  // with a specific tolerance rule instead of with the verdict, and that argument
  // is the point of the amendment flow. "not versioned" where the checker left it
  // empty — honest about a check whose policy is still implicit, and never an
  // invented version number.
  const policy = check.policy_version ?? "";
  const derivationId = `derivation-${instance}-${row.key}`;

  const values: React.ReactNode[] = [];
  if (finding?.claimed != null) {
    values.push(<ValuePair key="claimed" value={finding.claimed} label="claimed" />);
  }
  if (finding?.computed != null) {
    values.push(<ValuePair key="computed" value={finding.computed} label="computed" />);
  }
  if (finding?.delta != null) {
    values.push(<ValuePair key="delta" value={finding.delta} label="delta" />);
  }

  // Screen readers get the verdict in words on every row, since the glyph and
  // the colour both carry it visually (§12).
  const spoken =
    `${VERDICT_LABEL[row.verdict]}. ${row.title}` +
    (row.locator ? `. ${row.locator}` : "") +
    (row.verdict === "diverges" && finding
      ? `. Claimed ${finding.claimed}, computed ${finding.computed}`
      : "") +
    (sentence && !finding ? `. ${sentence}` : "");

  return (
    <div
      className="border-b"
      style={{
        borderColor: "var(--chrome-line)",
        // The connecting tint: this row and the live span in the paper are the
        // same claim, seen twice.
        background: selected ? "var(--anchor-trace)" : "transparent",
        boxShadow: selected ? "inset 2px 0 0 0 var(--focus)" : undefined,
        transition: reduced ? "none" : "background-color var(--dur-fast) var(--ease-out)",
      }}
    >
      <button
        type="button"
        data-ledger-row={row.key}
        onClick={() => onSelect(row.key)}
        aria-current={selected ? "true" : undefined}
        aria-label={spoken}
        className="flex w-full items-start gap-2 px-4 py-3 text-left"
      >
        {/* The margin. The mark here is the mark in the paper and the mark in
            the gutter, which is how a reader moves between the three. */}
        <SiglumSlot siglum={row.siglum} size={12} className="mt-[3px]" />

        <span className="mt-[3px] shrink-0">
          <VerdictGlyph verdict={row.verdict} size={13} active={selected} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="t-emph" style={{ color: "var(--chrome-text)" }}>
              {row.title}
            </span>
            <ProvenanceChip provenance={row.provenance} className="mt-[1px]" />
          </span>

          {/* The claim in the paper's own words, in the paper's own serif. */}
          {row.verbatim && (
            <span
              className="mt-1.5 block"
              style={{
                fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
                fontSize: "15px",
                lineHeight: 1.5,
                color: "var(--chrome-text)",
              }}
            >
              {row.verbatim}
            </span>
          )}

          {values.length > 0 && (
            <span className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {values}
              {row.verdict === "within_tolerance" && (
                <span className="t-body" style={{ color: "var(--chrome-dim)" }}>
                  within tolerance
                </span>
              )}
            </span>
          )}

          {/* The unverifiable row's entire content. Never the raw reason code. */}
          {!finding && sentence && (
            <span className="mt-1.5 block t-body" style={{ color: "var(--chrome-dim)" }}>
              {sentence}
            </span>
          )}

          {/* The check's description is not repeated on every row it produced —
              four identical sentences down the Verified group say nothing the
              group heading has not. It lives in Explain, once. */}

          <span
            className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 t-num"
            style={{ fontSize: "12px", color: "var(--chrome-faint)" }}
          >
            {row.locator && <span>{row.locator}</span>}
            {/* A `not_checked` entry is not a checker and has no version. Naming
                one here would print a system identifier as if it were a check a
                reader could go and read. */}
            {check.checker !== "not_checked" && (
              <>
                <span>
                  {check.checker} v{check.checker_version}
                </span>
                <span>policy {policy || "not versioned"}</span>
              </>
            )}
          </span>
        </span>
      </button>

      {/* Indented to the row's text column: 16px padding, the 20px margin slot,
          the verdict glyph, and the gaps between them. */}
      <div className="px-4 pb-3 ps-[65px]">
        <button
          type="button"
          onClick={() => onToggle(row.key)}
          aria-expanded={expanded}
          aria-controls={expanded ? derivationId : undefined}
          className="inline-flex items-center gap-1 t-body"
          style={{ borderRadius: "var(--radius-control)", color: "var(--chrome-dim)" }}
        >
          Explain
          <span
            aria-hidden
            className={cn("inline-block")}
            style={{
              transform: expanded ? "rotate(90deg)" : "none",
              transition: reduced ? "none" : "transform var(--dur-fast) var(--ease-out)",
              fontSize: "11px",
            }}
          >
            ▸
          </span>
          <span className="sr-only"> how this verdict was derived</span>
        </button>

        {expanded && (
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.12, ease: [0, 0, 0.2, 1] }}
          >
            <Derivation row={row} id={derivationId} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
