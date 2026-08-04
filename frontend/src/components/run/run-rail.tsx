"use client";

import { AnimatePresence } from "motion/react";

import type { RunReport } from "@/types/run-report";
import type { StreamRow } from "@/hooks/use-check-stream";
import { CheckRow } from "./check-row";

/**
 * §4's run rail: 280px fixed, the paper header at the top and the check list
 * below. This is where streaming happens.
 */
export function RunRail({
  report,
  rows,
  complete,
  selectedChecker,
  onSelect,
  onReplay,
  onShowNotChecked,
}: {
  report: RunReport;
  rows: StreamRow[];
  /** The elapsed readout moved to the masthead; the rail no longer prints it. */
  complete: boolean;
  selectedChecker: string | null;
  onSelect: (checker: string) => void;
  onReplay: () => void;
  onShowNotChecked: () => void;
}) {
  const notChecked = report.not_checked ?? [];

  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 flex-col border-r"
      // Column seam, so the grid ink. The rules inside this rail stay
      // `--chrome-line`: they divide a list, not the page.
      style={{ borderColor: "var(--rule-grid-deep)", background: "var(--chrome-panel)" }}
    >
      {/* §5.3 asks for the paper title, the arXiv id in mono and the elapsed
          time at the top of the rail. All three are still at the top of this
          view: they moved about 60px up into the masthead, which sits directly
          over this rail and names the document for every pane at once. Setting
          the title again here would put it twice on one screen, 60px apart, and
          the rail is 280px wide — it was the worst of the places to set it.

          What stays is what belongs to this rail and to nothing else: what the
          list under it is, and how much of the source it was built from. */}
      <header className="border-b px-4 py-2.5" style={{ borderColor: "var(--chrome-line)" }}>
        <p className="t-label">Checks</p>
        <p className="mt-1 t-body" style={{ color: "var(--chrome-dim)", fontSize: "12px" }}>
          {complete ? "Complete" : "Running"}
          {" · "}
          <span className="t-num" style={{ fontSize: "12px" }}>
            {report.tables_parsed ?? 0}
          </span>{" "}
          {report.tables_parsed === 1 ? "table read" : "tables read"}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          role="listbox"
          aria-label="Checks"
          className="flex flex-col divide-y"
          style={{ borderColor: "var(--chrome-line)" }}
        >
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <CheckRow
                key={row.check.checker}
                id={`check-${row.check.checker}`}
                row={row}
                selected={selectedChecker === row.check.checker}
                onSelect={() => onSelect(row.check.checker)}
              />
            ))}
          </AnimatePresence>
        </div>

        {rows.length === 0 && (
          <p className="px-4 py-3 t-body" style={{ color: "var(--chrome-faint)" }}>
            Waiting for the first result.
          </p>
        )}

        {/* §4 puts the "not checked" count at the foot of the rail. §5.5 makes
            the section first-class: it is what makes the tool trustworthy, and
            for most real papers it is the largest section. Not a failure state. */}
        {complete && (
          <section className="mt-2 border-t" style={{ borderColor: "var(--chrome-line)" }}>
            {notChecked.length === 0 ? (
              <div className="px-4 py-3">
                <h2 className="t-tag" style={{ color: "var(--chrome-text)" }}>
                  Not checked
                </h2>
                <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
                  Everything in this paper that these checks apply to was checked.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={onShowNotChecked}
                className="w-full px-4 py-3 text-left transition-colors"
                style={{ transitionDuration: "var(--dur-fast)" }}
              >
                <h2 className="t-tag" style={{ color: "var(--chrome-text)" }}>
                  Not checked
                </h2>
                <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
                  <span className="t-num">{notChecked.length}</span>{" "}
                  {notChecked.length === 1 ? "thing" : "things"} could not be checked.
                </p>
                {/* --focus-ink, not --focus: the accent at full strength is
                    4.18:1 on this panel and this is body text. Same accent, the
                    ink cut for a dark surface. */}
                <span className="mt-1.5 block t-body" style={{ color: "var(--focus-ink)" }}>
                  See the reasons
                </span>
              </button>
            )}
          </section>
        )}
      </div>

      <footer
        className="flex items-center justify-between border-t px-4 py-2"
        style={{ borderColor: "var(--chrome-line)" }}
      >
        <span className="t-body" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
          <kbd className="t-num" style={{ fontSize: "11px" }}>
            j
          </kbd>{" "}
          /{" "}
          <kbd className="t-num" style={{ fontSize: "11px" }}>
            k
          </kbd>{" "}
          to move
        </span>
        <button
          type="button"
          onClick={onReplay}
          className="px-2 py-1 t-body transition-colors"
          style={{
            borderRadius: "var(--radius-control)",
            color: "var(--focus-ink)",
            transitionDuration: "var(--dur-fast)",
            fontSize: "12px",
          }}
        >
          Replay the run
        </button>
      </footer>
    </div>
  );
}
