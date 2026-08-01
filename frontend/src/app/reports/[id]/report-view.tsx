"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { RunReport } from "@/types/run-report";
import { NavRail } from "@/components/shell/nav-rail";
import { Gutter } from "@/components/shell/gutter";
import { GutterMarks } from "@/components/gutter/gutter-marks";
import { deriveMarks } from "@/components/gutter/marks";
import { DocumentView } from "@/components/document/document-view";
import { scrollToAnchor } from "@/components/document/scroll";
import { FindingDetail } from "@/components/verdict/finding-detail";
import { ReportSummary } from "@/components/verdict/report-summary";

/**
 * §5.5's permalink page, laid out on §4's grid.
 *
 * Left to right: nav rail, the report itself in the 280px rail, the document
 * pane, the 48px gutter, the verdict detail pane. The §5.5 content sits in the
 * rail rather than on its own scrolling page so that the marks, the document, and
 * the evidence are all reachable without leaving the report — §2 makes the gutter
 * the primary navigation, which only works if there is a document beside it.
 *
 * Selection is by mark, and one selection drives all three surfaces at once
 * (§5.4): the document scrolls and highlights, the mark activates, the verdict
 * pane shows the evidence.
 */
export function ReportView({ report }: { report: RunReport }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const cancelScroll = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion() ?? false;

  const marks = useMemo(() => deriveMarks(report), [report]);
  const selected = useMemo(
    () => marks.find((m) => m.key === selectedKey) ?? null,
    [marks, selectedKey],
  );

  /** §5.4's three things, in one call. */
  const select = useCallback(
    (key: string) => {
      setSelectedKey(key);
      setSheetOpen(true);

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

  const close = useCallback(() => {
    setSheetOpen(false);
    setSelectedKey(null);
  }, []);

  useEffect(() => () => cancelScroll.current?.(), []);

  // §12: j/k move between findings, Enter opens, Esc closes. The order walked is
  // the gutter's own — document order — so the keys move the eye down the paper
  // rather than through an ordering only the data model knows about.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (marks.length === 0) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const at = selectedKey ? marks.findIndex((m) => m.key === selectedKey) : -1;
        const next =
          e.key === "j"
            ? Math.min(marks.length - 1, at + 1)
            : Math.max(0, at <= 0 ? 0 : at - 1);
        // j/k move the selection without opening the sheet; Enter opens it. On
        // the three-column layout the pane is always visible, so the distinction
        // only bites below 1100px, which is exactly where it matters.
        const key = marks[next].key;
        setSelectedKey(key);
        document.getElementById(`mark-${key}`)?.scrollIntoView({ block: "nearest" });
        const pane = paneRef.current;
        const el = document.getElementById(marks[next].domId);
        if (pane && el) {
          cancelScroll.current?.();
          cancelScroll.current = scrollToAnchor(pane, el, reduced);
        }
      } else if (e.key === "Enter") {
        if (selectedKey) {
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
  }, [marks, selectedKey, close, reduced]);

  const detail = selected ? (
    <FindingDetail
      mark={selected}
      position={marks.findIndex((m) => m.key === selected.key) + 1}
      total={marks.length}
      onClose={close}
    />
  ) : (
    <div className="px-5 py-4">
      <h2 className="t-label">Evidence</h2>
      <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
        Choose a mark, or a row in the report, to see the numbers behind it. Every mark points
        at the exact cell the check read.
      </p>
      <p className="mt-3 t-body" style={{ color: "var(--chrome-faint)" }}>
        <kbd className="t-num">j</kbd> and <kbd className="t-num">k</kbd> move between marks,{" "}
        <kbd className="t-num">enter</kbd> opens one, <kbd className="t-num">esc</kbd> closes.
      </p>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: "var(--chrome-base)" }}>
      <NavRail />

      <div className="flex min-w-0 flex-1 flex-col two:flex-row">
        {/* §5.5's report. Below 760px it stacks above the paper, which puts the
            fingerprint and the "not checked" list above the fold on a phone — the
            one place they could most easily have been buried. Capped there and
            scrolled internally, so a long not-checked list cannot squeeze the
            paper off the screen. */}
        <aside
          className="flex max-h-[45dvh] shrink-0 overflow-hidden border-b two:max-h-none two:h-full two:w-[var(--run-rail-w)] two:border-b-0 two:border-r"
          style={{ borderColor: "var(--chrome-line)" }}
        >
          <ReportSummary
            report={report}
            marks={marks}
            selectedKey={selectedKey}
            onSelect={select}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 three:grid three:grid-cols-[var(--split-doc)_var(--gutter-w)_var(--split-verdict)]">
          {/* The document pane is its own scroll box at every width, so the mark
              layer always has one element to measure and listen to. */}
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

          <div
            className="hidden min-h-0 min-w-0 overflow-y-auto border-l three:block"
            style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-panel)" }}
          >
            {detail}
          </div>
        </div>
      </div>

      {/* Below 1100px the verdict pane is a bottom sheet (§4): y 8→0 with
          opacity over 200ms (§6). */}
      <AnimatePresence>
        {sheetOpen && selected && (
          <motion.div
            key="sheet"
            role="dialog"
            aria-label="Verdict detail"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 8 }}
            transition={{ duration: reduced ? 0.001 : 0.2, ease: [0, 0, 0.2, 1] }}
            className="fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-[6px] border-t three:hidden"
            style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-panel)" }}
          >
            {detail}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
