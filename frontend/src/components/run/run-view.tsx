"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { RunReport } from "@/types/run-report";
import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { useCheckStream } from "@/hooks/use-check-stream";
import { recordedElapsedSeconds } from "@/lib/stream";
import { NavRail } from "@/components/shell/nav-rail";
import { appFonts } from "@/components/shell/fonts";
import { Gutter } from "@/components/shell/gutter";
import { DocumentPane } from "./document-pane";
import { Masthead, MastheadLink } from "./masthead";
import { RunRail } from "./run-rail";
import { VerdictPane } from "./verdict-pane";

/**
 * §5.3's run view, assembled on §4's layout.
 *
 * Three regions left to right: the 56px nav rail, the 280px run rail, and the
 * content region split into document pane / 48px gutter / verdict pane at 55/45.
 *
 * Responsive (§4, §12):
 *   ≥1100px  verdict pane is the third column
 *   760px+   verdict pane becomes a bottom sheet; document and gutter stay side
 *            by side
 *   <760px   single column, run rail stacks above the document, no gutter —
 *            gutter marks become inline badges, which is Agent F's half of that
 *   works down to 390px
 */
export function RunView({ report }: { report: RunReport }) {
  const [replayKey, setReplayKey] = useState(0);
  const [selectedChecker, setSelectedChecker] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The gate, not `motion`'s `useReducedMotion`. See `motion/scrub.tsx`: the
  // latter disagrees with the server on the first client render, and this value
  // sets the sheet's initial offset.
  const reduced = useReducedMotionGate();

  const { rows, progress, complete } = useCheckStream(report, replayKey);

  // The readout settles on the run's real recorded duration, interpolated across
  // the replay so the number the user reads at the end is the checker's, not the
  // animation's.
  const elapsed = recordedElapsedSeconds(report) * progress;

  const selected = useMemo(
    () => (report.checks ?? []).find((c) => c.checker === selectedChecker) ?? null,
    [report.checks, selectedChecker],
  );

  const select = useCallback((checker: string) => {
    setSelectedChecker(checker);
    setSheetOpen(true);
  }, []);

  const close = useCallback(() => {
    setSheetOpen(false);
    setSelectedChecker(null);
  }, []);

  // §12 keyboard floor: j/k move between findings, Enter opens, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (rows.length === 0) return;

      const order = rows.map((r) => r.check.checker);
      const at = selectedChecker ? order.indexOf(selectedChecker) : -1;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next =
          e.key === "j"
            ? Math.min(order.length - 1, at + 1)
            : Math.max(0, at <= 0 ? 0 : at - 1);
        const checker = order[next];
        setSelectedChecker(checker);
        document.getElementById(`check-${checker}`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        if (selectedChecker) {
          e.preventDefault();
          setSheetOpen(true);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selectedChecker, close]);

  const verdictPane = <VerdictPane report={report} check={selected} onClose={close} />;

  return (
    <div
      className={`flex h-dvh overflow-hidden ${appFonts}`}
      style={{ background: "var(--chrome-base)" }}
    >
      <NavRail />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Masthead
          report={report}
          trail={
            complete ? (
              <MastheadLink href={`/reports/${report.arxiv_id}`}>the report</MastheadLink>
            ) : undefined
          }
          status={
            <span className="flex items-baseline gap-2.5 t-num" style={{ fontSize: "12px" }}>
              <span style={{ color: "var(--chrome-dim)" }}>
                {complete ? "checks complete" : "checks running"}
              </span>
              <span style={{ color: "var(--chrome-text)" }}>{elapsed.toFixed(1)}s</span>
            </span>
          }
        />

        {/* The same card the report is set in, so the two views are one surface
            seen at two moments rather than two designs. Everything inside it —
            the run rail, the paper, the gutter, the verdict pane — is clipped by
            the one radius; nothing in there rounds on its own. */}
        <div className="min-h-0 min-w-0 flex-1 p-2.5 pt-0 three:p-3.5 three:pt-0">
          <div
            className="flex h-full min-h-0 flex-col overflow-hidden border two:flex-row"
            style={{
              borderRadius: "var(--radius-surface)",
              borderColor: "var(--rule-grid-deep)",
            }}
          >
            {/* Stacked above the document below 760px, so it is capped there — a
                run with twelve checks must not squeeze the paper off the
                screen. */}
            <aside className="flex max-h-[45dvh] shrink-0 overflow-hidden two:h-full two:max-h-none two:w-[var(--run-rail-w)]">
              <RunRail
                report={report}
                rows={rows}
                complete={complete}
                selectedChecker={selectedChecker}
                onSelect={select}
                // The pane's resting content is the not-checked list, so showing
                // it means clearing the selection — and opening the sheet below
                // 1100px.
                onShowNotChecked={() => {
                  setSelectedChecker(null);
                  setSheetOpen(true);
                }}
                onReplay={() => {
                  setReplayKey((k) => k + 1);
                  close();
                }}
              />
            </aside>

            {/* Content region — document / gutter / verdict at 55/45 with a
                fixed 48px gutter track between them. */}
            <div className="flex min-h-0 min-w-0 flex-1 three:grid three:grid-cols-[var(--split-doc)_var(--gutter-w)_var(--split-verdict)]">
              <div className="min-h-0 min-w-0 flex-1 three:flex-none">
                <DocumentPane report={report} />
              </div>

              <Gutter />

              <div className="hidden min-h-0 min-w-0 three:block">{verdictPane}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Below 1100px the verdict pane is a bottom sheet (§4). Opens y 8→0 with
          opacity over 200ms (§6). */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            key="sheet"
            role="dialog"
            aria-label="Verdict detail"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 8 }}
            transition={{ duration: reduced ? 0.001 : 0.2, ease: [0, 0, 0.2, 1] }}
            // Inset to the card's own left edge rather than to the window's: the
            // sheet used to slide under the 56px nav rail, which put a pane on
            // top of the product's own navigation.
            className="fixed right-2.5 bottom-0 left-[calc(var(--nav-rail-w)+0.625rem)] z-20 max-h-[70dvh] overflow-y-auto border three:hidden"
            style={{
              // An outer surface, so it rounds at the landing's rate rather than
              // §3's 6px. The rows inside it do not.
              borderTopLeftRadius: "var(--radius-surface)",
              borderTopRightRadius: "var(--radius-surface)",
              borderColor: "var(--rule-grid-deep)",
              background: "var(--chrome-panel)",
            }}
          >
            {verdictPane}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
