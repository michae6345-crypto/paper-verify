"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

import type { RunReport } from "@/types/run-report";
import type { Mark } from "@/components/gutter/marks";
import { cn } from "@/lib/utils";
import {
  buildLedger,
  GROUP_BLURB,
  GROUP_LABEL,
  type LedgerGroup,
  type LedgerItem,
} from "./groups";
import { LedgerRow } from "./ledger-row";
import { useVirtualWindow } from "./virtual";

/**
 * The claims ledger: every claim the run touched, grouped by what the checkers
 * were able to say about it, in document order inside each group.
 *
 * The ledger is one half of the anchor. Selecting a row scrolls the paper to the
 * claim's span and lights it; selecting a span in the paper selects the row. Both
 * directions run through the same `Mark` list and the same `Anchor.dom_id`, so
 * the two panes cannot disagree about which claim is live.
 *
 * It is not sortable and not filterable, on purpose (UI_PLAN.md). Sorting would
 * break the correspondence with the paper, and the correspondence is the product.
 */

/**
 * First-paint heights, replaced by measurement as rows render. Rough is fine —
 * these only decide how much is mounted before anything has been measured.
 */
const ESTIMATE = { header: 62, row: 132, discrepancyRow: 190, empty: 64 };

function estimateFor(item: LedgerItem): number {
  if (item.kind === "header") return ESTIMATE.header;
  if (item.kind === "empty") return ESTIMATE.empty;
  return item.row.verdict === "diverges" ? ESTIMATE.discrepancyRow : ESTIMATE.row;
}

function GroupHeader({ group, count }: { group: LedgerGroup; count: number }) {
  return (
    <div
      className="border-y px-4 py-2.5"
      style={{ background: "var(--ledger-band)", borderColor: "var(--chrome-line)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* This was set in the paper's own serif, on UI_PLAN.md's idea that the
            instrument quotes the document it is examining. It now sits in
            residual's display face instead, and the distinction is sharper for
            it: Source Serif is the PAPER speaking — the verbatim claim on a
            ledger row, the explanation in the verdict pane — and Instrument
            Serif is residual naming its own sections, here and on the landing.
            Three faces, three jobs, rather than two serifs sharing one. */}
        <h3 className="t-tag" style={{ color: "var(--chrome-text)" }}>
          {GROUP_LABEL[group]}
        </h3>
        {/* The count labels something a reader can go and look at. There is no
            aggregate anywhere in this pane, and there is not going to be one. */}
        <span className="t-num" style={{ color: "var(--chrome-dim)" }}>
          {count}
        </span>
      </div>
      {count > 0 && (
        <p className="mt-1 t-body" style={{ color: "var(--chrome-dim)" }}>
          {GROUP_BLURB[group]}
        </p>
      )}
    </div>
  );
}

export function Ledger({
  report,
  marks,
  selectedKey,
  reduced,
  onSelect,
  className,
  style,
  headerSlot,
  instance = "pane",
}: {
  report: RunReport;
  marks: Mark[];
  selectedKey: string | null;
  reduced: boolean;
  onSelect: (key: string) => void;
  className?: string;
  /** Merged over the panel background — the caller sets the seam's ink here. */
  style?: React.CSSProperties;
  /** Rendered above the list — the mobile sheet puts its handle here. */
  headerSlot?: React.ReactNode;
  /**
   * The ledger is mounted twice, as a pane above 1100px and as a sheet below it,
   * with CSS deciding which one exists. Element ids are scoped by this so the
   * two copies cannot collide.
   */
  instance?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const items = useMemo(() => buildLedger(report, marks), [report, marks]);

  const rowIndices = useMemo(
    () => items.map((it, i) => (it.kind === "row" ? i : -1)).filter((i) => i !== -1),
    [items],
  );

  const estimateSize = useCallback((index: number) => estimateFor(items[index]), [items]);

  const view = useVirtualWindow({ count: items.length, estimateSize, scrollRef });

  const scrollToIndex = useCallback(
    (index: number) => {
      const pane = scrollRef.current;
      if (!pane) return;
      const top = view.offsetOf(index);
      const size = view.sizeOf(index);
      const current = pane.scrollTop;
      // Only move if the row is not already comfortably in view — a selection
      // arriving from the paper should not yank a ledger the reader is reading.
      if (top >= current + 8 && top + size <= current + pane.clientHeight - 8) return;
      pane.scrollTop = Math.max(0, top - pane.clientHeight / 3);
    },
    [view],
  );

  // The paper drives the ledger: a span selected in the document brings its row
  // into view here.
  useEffect(() => {
    if (!selectedKey) return;
    const index = items.findIndex((it) => it.kind === "row" && it.row.key === selectedKey);
    if (index !== -1) scrollToIndex(index);
    // scrollToIndex changes identity whenever a row is measured; re-running on
    // that would fight the reader's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, items]);

  const focusRow = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.kind !== "row") return;
      onSelect(item.row.key);
      scrollToIndex(index);
      // The row may not be mounted yet if it was outside the window.
      requestAnimationFrame(() => {
        const el = scrollRef.current?.querySelector<HTMLElement>(
          `[data-ledger-row="${CSS.escape(item.row.key)}"]`,
        );
        el?.focus();
      });
    },
    [items, onSelect, scrollToIndex],
  );

  // §12's keyboard floor, on the list itself: arrows move between claims, Enter
  // opens the derivation, Escape closes it. `j`/`k` are bound globally by the
  // report view and keep working here.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (rowIndices.length === 0) return;
      const at = rowIndices.findIndex(
        (i) => (items[i] as { row: { key: string } }).row.key === selectedKey,
      );

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next =
          e.key === "ArrowDown"
            ? Math.min(rowIndices.length - 1, at + 1)
            : Math.max(0, at <= 0 ? 0 : at - 1);
        focusRow(rowIndices[next]);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusRow(rowIndices[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        focusRow(rowIndices[rowIndices.length - 1]);
      } else if (e.key === "Enter" && selectedKey) {
        // Only from the row itself. On the Explain button, Enter is already the
        // button's own click, and handling it twice would toggle it back.
        if (!(e.target as HTMLElement).hasAttribute("data-ledger-row")) return;
        e.preventDefault();
        setExpanded((prev) => new Set(prev).add(selectedKey));
      } else if (e.key === "Escape" && selectedKey) {
        setExpanded((prev) => {
          if (!prev.has(selectedKey)) return prev;
          const next = new Set(prev);
          next.delete(selectedKey);
          return next;
        });
      }
    },
    [rowIndices, items, selectedKey, focusRow],
  );

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const claimCount = rowIndices.length;

  return (
    // `flex flex-col` as classes rather than an inline style: the caller hides
    // one of the two copies with `hidden`, and an inline `display: flex` would
    // win over it — which showed up as the desktop pane rendering on a phone.
    <div
      className={cn("flex flex-col", className)}
      style={{ background: "var(--chrome-panel)", ...style }}
    >
      {headerSlot}

      {/* NO HEADER. This pane used to open with the paper's title, its arXiv id
          and the verdict fingerprint, which is about 110px of a 720px viewport
          spent naming a document that is also named in the masthead directly
          above it and set in 33pt serif in the pane to the left. §3's density
          target is a run with twelve checks on a 900px viewport; three titles on
          one screen is how that target gets missed.

          The first group band is the pane's top edge now, and it is a better
          one: it names something a reader can act on. */}

      <div
        ref={scrollRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {claimCount === 0 ? (
          <p className="px-4 py-6 t-body" style={{ color: "var(--chrome-dim)" }}>
            No claims to list. Nothing in this paper matched a check that is running yet — the
            paper pane still shows what the parser read.
          </p>
        ) : (
          <div
            role="list"
            aria-label="Claims"
            className="relative w-full"
            style={{ height: view.totalSize }}
          >
            {view.items.map(({ index, start }) => {
              const item = items[index];
              return (
                <motion.div
                  key={item.key}
                  ref={view.measureRef}
                  data-vindex={index}
                  // Every direct child of the list is a list item, group
                  // headings included: a heading announces which group the rows
                  // after it belong to, which is exactly what a reader moving
                  // through the list by item needs to hear.
                  role="listitem"
                  // A row moving from one group into another — which is what a
                  // streaming run does as verdicts resolve — animates to its new
                  // position rather than vanishing and reappearing somewhere
                  // else. 180ms easeOut, no overshoot; instant under reduced
                  // motion. Offsets are content-space, so scrolling never
                  // triggers this.
                  layoutId={item.kind === "row" ? `claim-${item.row.identity}` : undefined}
                  layout={item.kind === "row" ? "position" : false}
                  initial={false}
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0, 0, 0.2, 1] }}
                  className="absolute inset-x-0"
                  style={{ top: start }}
                >
                  {item.kind === "header" && (
                    <GroupHeader group={item.group} count={item.count} />
                  )}

                  {/* Zero discrepancies is the normal result — all ten
                      validated papers land here — so it is stated plainly and
                      not congratulated. */}
                  {item.kind === "empty" && (
                    <p className="px-4 py-3 t-body" style={{ color: "var(--chrome-dim)" }}>
                      Nothing diverged. Every value these checks compared agreed with the
                      paper&apos;s own numbers.
                    </p>
                  )}

                  {item.kind === "row" && (
                    <LedgerRow
                      row={item.row}
                      instance={instance}
                      selected={item.row.key === selectedKey}
                      expanded={expanded.has(item.row.key)}
                      reduced={reduced}
                      onSelect={onSelect}
                      onToggle={toggle}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
