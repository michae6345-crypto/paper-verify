"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import type { RunReport } from "@/types/run-report";
import { NavRail } from "@/components/shell/nav-rail";
import { Gutter } from "@/components/shell/gutter";
import { GutterMarks } from "@/components/gutter/gutter-marks";
import { deriveMarks } from "@/components/gutter/marks";
import { DocumentView } from "@/components/document/document-view";
import { scrollToAnchor } from "@/components/document/scroll";
import { Ledger } from "@/components/ledger/ledger";
import { countClaims } from "@/components/ledger/groups";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";

/**
 * §5.5's permalink, as the anchored two-pane report.
 *
 * Left to right: nav rail, the paper, the 48px gutter, the claims ledger. The
 * two panes are §2's two materials — a light, serif, typeset artifact held
 * against a dark, dense instrument — and the seam between them is the gutter.
 *
 * THE ANCHOR IS THE PRODUCT. One selection drives everything:
 *
 *   ledger row → the paper scrolls to the claim's span and lights exactly that
 *                span, and the gutter mark beside it activates
 *   paper span → the same claim's row is selected and brought into view in the
 *                ledger
 *   gutter mark → both of the above
 *
 * All three routes call `select` with the same key, and that key is the mark's,
 * which is derived from `Anchor.dom_id` — the id the document pane has already
 * put on the cell. There is no second mapping to fall out of step.
 */
export function ReportView({ report }: { report: RunReport }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const cancelScroll = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion() ?? false;

  const marks = useMemo(() => deriveMarks(report), [report]);
  const claims = useMemo(() => countClaims(report, marks), [report, marks]);
  const selected = useMemo(
    () => marks.find((m) => m.key === selectedKey) ?? null,
    [marks, selectedKey],
  );

  /** Select a claim, from whichever pane asked. */
  const select = useCallback(
    (key: string) => {
      setSelectedKey(key);
      // On one column the ledger is a sheet over the paper, so selecting a claim
      // collapses it to its peek row and lets the paper scroll (UI_PLAN.md). The
      // link still works in one column; it costs a collapse.
      setSheetOpen(false);

      const mark = marks.find((m) => m.key === key);
      const pane = paneRef.current;
      if (!mark || !pane) return;
      const target = document.getElementById(mark.domId);
      if (!target) return;

      cancelScroll.current?.();
      cancelScroll.current = scrollToAnchor(pane, target, reduced);
    },
    [marks, reduced],
  );

  useEffect(() => () => cancelScroll.current?.(), []);

  // §12: j/k move between claims in document order — the order the gutter walks,
  // which moves the eye down the paper rather than through an ordering only the
  // data model knows about. Arrow keys do the same inside the ledger, where the
  // order is the ledger's own grouping; both are bound because the two panes
  // genuinely have two orders and a reader is looking at one of them.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        setSheetOpen(false);
        return;
      }
      if (marks.length === 0) return;
      if (e.key !== "j" && e.key !== "k") return;

      e.preventDefault();
      const at = selectedKey ? marks.findIndex((m) => m.key === selectedKey) : -1;
      const next =
        e.key === "j"
          ? Math.min(marks.length - 1, at + 1)
          : Math.max(0, at <= 0 ? 0 : at - 1);
      select(marks[next].key);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marks, selectedKey, select]);

  const ledgerProps = {
    report,
    marks,
    selectedKey,
    reduced,
    onSelect: select,
  };

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: "var(--chrome-base)" }}>
      <NavRail />

      <div className="flex min-h-0 min-w-0 flex-1 three:grid three:grid-cols-[var(--split-doc)_var(--gutter-w)_var(--split-verdict)]">
        {/* The paper. Its own scroll box at every width, so the mark layer always
            has one element to measure and listen to. */}
        <div className="min-h-0 min-w-0 flex-1 three:flex-none">
          <DocumentView
            ref={paneRef}
            report={report}
            marks={marks}
            selectedDomId={selected?.domId ?? null}
            selectedVerdict={selected?.verdict ?? null}
            reduced={reduced}
            onSelect={select}
          />
        </div>

        <Gutter>
          <GutterMarks
            marks={marks}
            selectedKey={selectedKey}
            scrollRef={paneRef}
            onSelect={select}
          />
        </Gutter>

        {/* Keyed on the paper: a different report is a different ledger, and the
            virtualiser's measured row heights must not survive the swap. */}
        <Ledger
          key={report.arxiv_id}
          {...ledgerProps}
          instance="pane"
          className="hidden min-h-0 min-w-0 border-l three:flex"
        />
      </div>

      {/* Below 1100px the ledger is a sheet over the paper, dragged up from the
          bottom edge. It never unmounts: collapsing it to the peek row keeps the
          claim count and the selected claim visible, so the link between the two
          panes is legible even while the paper has the screen. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex h-[72dvh] flex-col rounded-t-[6px] border-t three:hidden"
        style={{
          borderColor: "var(--chrome-line)",
          background: "var(--chrome-panel)",
          transform: sheetOpen ? "translateY(0)" : "translateY(calc(100% - 52px))",
          transition: reduced ? "none" : "transform var(--dur-panel) var(--ease-out)",
        }}
      >
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen}
          className="flex h-[52px] w-full shrink-0 items-center gap-2.5 px-4"
        >
          <span
            aria-hidden
            className="h-[3px] w-8 shrink-0 rounded-[2px]"
            style={{ background: "var(--chrome-faint)" }}
          />
          <span className="min-w-0 flex-1 truncate text-start">
            {selected ? (
              <span className="inline-flex min-w-0 items-center gap-2">
                <VerdictGlyph verdict={selected.verdict} size={12} active />
                <span className="truncate t-emph" style={{ color: "var(--chrome-text)" }}>
                  {selected.check.display_name || selected.check.checker}
                </span>
                <span className="sr-only">{VERDICT_LABEL[selected.verdict]}</span>
              </span>
            ) : (
              <span className="t-emph" style={{ color: "var(--chrome-text)" }}>
                Claims
              </span>
            )}
          </span>
          {/* The ledger's own count, not the gutter's: a `not_checked` entry
              naming no table is a claim with no mark, and the peek row would
              otherwise under-report the list behind it. */}
          <span className="t-num shrink-0" style={{ color: "var(--chrome-dim)" }}>
            {claims}
          </span>
          <span className="sr-only">{sheetOpen ? "Hide the claims" : "Show the claims"}</span>
        </button>

        <Ledger
          key={`sheet-${report.arxiv_id}`}
          {...ledgerProps}
          instance="sheet"
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
