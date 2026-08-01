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
  elapsedSeconds,
  complete,
  selectedChecker,
  onSelect,
  onReplay,
  onShowNotChecked,
}: {
  report: RunReport;
  rows: StreamRow[];
  elapsedSeconds: number;
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
      style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-panel)" }}
    >
      {/* Paper header — title, arXiv ID in mono, elapsed time (§5.3) */}
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--chrome-line)" }}>
        <h1 className="t-panel-title" style={{ color: "var(--chrome-text)" }}>
          {report.title || "Untitled paper"}
        </h1>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="t-num" style={{ color: "var(--chrome-dim)", fontSize: "12px" }}>
            {report.arxiv_id}
          </span>
          <span className="t-num" style={{ color: "var(--chrome-dim)", fontSize: "12px" }}>
            {elapsedSeconds.toFixed(1)}s
          </span>
        </div>
        <p className="mt-1.5 t-body" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
          {complete ? "Checks complete" : "Checks running"}
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
                <h2 className="t-label">Not checked</h2>
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
                <h2 className="t-label">Not checked</h2>
                <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
                  <span className="t-num">{notChecked.length}</span>{" "}
                  {notChecked.length === 1 ? "thing" : "things"} could not be checked.
                </p>
                <span className="mt-1.5 block t-body" style={{ color: "var(--focus)" }}>
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
          className="rounded-[4px] px-2 py-1 t-body transition-colors"
          style={{ color: "var(--focus)", transitionDuration: "var(--dur-fast)", fontSize: "12px" }}
        >
          Replay the run
        </button>
      </footer>
    </div>
  );
}
