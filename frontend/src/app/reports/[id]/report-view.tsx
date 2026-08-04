"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RunReport } from "@/types/run-report";
import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { NavRail } from "@/components/shell/nav-rail";
import { appFonts } from "@/components/shell/fonts";
import { Gutter } from "@/components/shell/gutter";
import { GutterMarks } from "@/components/gutter/gutter-marks";
import { deriveMarks } from "@/components/gutter/marks";
import { DocumentView } from "@/components/document/document-view";
import { scrollToAnchor } from "@/components/document/scroll";
import { Ledger } from "@/components/ledger/ledger";
import { countClaims } from "@/components/ledger/groups";
import { Masthead, MastheadLink } from "@/components/run/masthead";
import { GlyphStrip, VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL, VERDICT_RANK } from "@/lib/verdict";

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
  // `useReducedMotionGate`, never `useReducedMotion` from motion/react. This
  // value reaches the sheet's inline `transition`, and `useReducedMotion` reads
  // false on the server and the truth on the client's first render. React
  // reconciles hydration on element type rather than on attributes, so the
  // server's transition string would survive onto a node the client believes has
  // none. The gate agrees with the server until a layout effect has run.
  const reduced = useReducedMotionGate();

  const marks = useMemo(() => deriveMarks(report), [report]);
  const claims = useMemo(() => countClaims(report, marks), [report, marks]);
  const selected = useMemo(
    () => marks.find((m) => m.key === selectedKey) ?? null,
    [marks, selectedKey],
  );

  // §5.5's fingerprint: one glyph per check, in a fixed order, so two runs of
  // the same shape always look the same. It used to sit inside the ledger's own
  // header; it names the whole report rather than the claims list, so it now
  // sits in the masthead with the title.
  const strip = useMemo(
    () =>
      (report.checks ?? [])
        .map((c) => c.verdict)
        .sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b]),
    [report.checks],
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
    <div
      className={`flex h-dvh overflow-hidden ${appFonts}`}
      style={{ background: "var(--chrome-base)" }}
    >
      <NavRail />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Masthead
          report={report}
          trail={<MastheadLink href={`/runs/${report.arxiv_id}`}>the run</MastheadLink>}
          status={
            <span className="flex items-center gap-2.5">
              <GlyphStrip verdicts={strip} size={13} />
              <span className="t-num" style={{ fontSize: "12px", color: "var(--chrome-dim)" }}>
                {claims} {claims === 1 ? "claim" : "claims"}
              </span>
            </span>
          }
        />

        {/* THE REPORT AS ONE CARD.

            The landing is a field with cards standing on it, and the report was
            two panes running edge to edge into the window with square corners —
            the same content, in the surface language of the thing that came
            before the redesign. This is the reconciliation, and it is one card
            rather than two: the paper, the gutter and the ledger sit inside a
            single rounded surface, so the gutter stays the *seam between two
            materials* (§2) instead of becoming a channel of background between
            two floating objects. Rounding the panes separately would have put
            four more corners either side of the signature element.

            No shadow. §3 strips elevation from the app chrome and that rule is
            intact: the card is read from its radius, its 1px construction rule,
            and the field showing around it. The landing's elevation tokens are
            scoped to `[data-site]` and stay there. */}
        <div className="min-h-0 min-w-0 flex-1 p-2.5 pt-0 three:p-3.5 three:pt-0">
          <div
            className="flex h-full min-h-0 overflow-hidden border three:grid three:grid-cols-[var(--split-doc)_var(--gutter-w)_var(--split-verdict)]"
            style={{
              borderRadius: "var(--radius-surface)",
              borderColor: "var(--rule-grid-deep)",
            }}
          >
            {/* The paper. Its own scroll box at every width, so the mark layer
                always has one element to measure and listen to. */}
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

            {/* Keyed on the paper: a different report is a different ledger, and
                the virtualiser's measured row heights must not survive the
                swap. */}
            <Ledger
              key={report.arxiv_id}
              {...ledgerProps}
              instance="pane"
              className="hidden min-h-0 min-w-0 three:flex"
            />
          </div>
        </div>
      </div>

      {/* Below 1100px the ledger is a sheet over the paper, dragged up from the
          bottom edge. It never unmounts: collapsing it to the peek row keeps the
          claim count and the selected claim visible, so the link between the two
          panes is legible even while the paper has the screen. */}
      <div
        // Inset to the card's own left edge rather than to the window's: the
        // sheet used to slide under the 56px nav rail, which put a pane on top
        // of the product's own navigation.
        className="fixed right-2.5 bottom-0 left-[calc(var(--nav-rail-w)+0.625rem)] z-20 flex h-[72dvh] flex-col overflow-hidden border three:hidden"
        style={{
          // An outer surface, so it rounds at the landing's rate rather than
          // §3's 6px. The ledger rows inside it do not.
          borderTopLeftRadius: "var(--radius-surface)",
          borderTopRightRadius: "var(--radius-surface)",
          // The sheet's top edge is the same seam as the pane's left edge, one
          // column layout down, so it carries the same grid ink.
          borderColor: "var(--rule-grid-deep)",
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
