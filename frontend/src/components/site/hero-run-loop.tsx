"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { CheckRow } from "@/components/run/check-row";
import { useCheckStream, staticRows } from "@/hooks/use-check-stream";
import type { RunReport } from "@/types/run-report";
import type { SiteReport } from "./corpus.server";

/**
 * §16's replacement for a mascot: the run view, in miniature, playing real runs.
 *
 * Every row, verdict, reason and duration comes from `fixtures/reports/*.json`,
 * the committed output of the real checker on real papers. The rows are the
 * product's own `CheckRow`, not a lookalike, so what a visitor watches here is
 * what they get. Nothing is staged: the Transformer paper really does resolve
 * with one check `not attempted`, and that is left on screen.
 *
 * Under `prefers-reduced-motion` the loop stops entirely: one run, all rows
 * resolved, no cycling.
 */

/** How long a finished run holds before the next paper starts. */
const HOLD_MS = 2600;

function toRunReport(report: SiteReport): RunReport {
  return {
    arxiv_id: report.arxiv_id,
    title: report.title,
    checks: report.checks,
    started_at: report.started_at,
    finished_at: report.finished_at,
  };
}

function Frame({ report, children }: { report: SiteReport; children: React.ReactNode }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ background: "var(--chrome-panel)" }}
    >
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--chrome-line)" }}>
        <p
          className="truncate font-medium"
          style={{ color: "var(--chrome-text)", fontSize: "14px", lineHeight: 1.3 }}
        >
          {report.title || "Untitled paper"}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="t-num" style={{ color: "var(--chrome-dim)", fontSize: "12px" }}>
            {report.arxiv_id}
          </span>
          <span className="t-num" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
            <span className="t-num">{report.tables_parsed}</span>{" "}
            {report.tables_parsed === 1 ? "table read" : "tables read"}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 divide-y" style={{ borderColor: "var(--chrome-line)" }}>
        {children}
      </div>
    </div>
  );
}

function Foot({ report, complete }: { report: SiteReport; complete: boolean }) {
  return (
    <footer
      className="flex items-baseline justify-between gap-3 border-t px-4 py-2.5"
      style={{ borderColor: "var(--chrome-line)" }}
    >
      <span style={{ color: "var(--chrome-dim)", fontSize: "12px" }}>
        {complete ? "Checks complete" : "Checks running"}
      </span>
      <span className="t-num" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
        {report.not_checked > 0 ? (
          <>
            <span className="t-num">{report.not_checked}</span>{" "}
            {report.not_checked === 1 ? "thing" : "things"} not checked
          </>
        ) : (
          "nothing left unchecked"
        )}
      </span>
    </footer>
  );
}

function Playing({ report, onDone }: { report: SiteReport; onDone: () => void }) {
  const { rows, complete } = useCheckStream(toRunReport(report), 0);

  useEffect(() => {
    if (!complete) return;
    const id = window.setTimeout(onDone, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [complete, onDone]);

  return (
    <>
      <Frame report={report}>
        {rows.map((row) => (
          <CheckRow
            key={row.check.checker}
            id={`site-check-${row.check.checker}`}
            row={row}
            selected={false}
            onSelect={() => {}}
          />
        ))}
      </Frame>
      <Foot report={report} complete={complete} />
    </>
  );
}

export function HeroRunLoop({ reports }: { reports: SiteReport[] }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  if (reports.length === 0) return null;

  const report = reduced ? reports[0] : reports[index % reports.length];

  return (
    <div
      className="overflow-hidden border"
      style={{
        borderColor: "var(--chrome-line)",
        borderRadius: "var(--radius-panel)",
        background: "var(--chrome-panel)",
      }}
    >
      {/* The miniature is a picture of the run view, not a control surface. Its
          rows are real `CheckRow` buttons, so it is taken out of the tab order
          and described in text instead. */}
      <span className="sr-only">
        A looping miniature of the run view, replaying the checker&rsquo;s recorded output on{" "}
        {reports.length} papers from the validation corpus.
      </span>

      <div inert aria-hidden="true" className="min-h-[196px]">
        {reduced ? (
          <>
            <Frame report={report}>
              {staticRows(report.checks).map((row) => (
                <CheckRow
                  key={row.check.checker}
                  id={`site-check-${row.check.checker}`}
                  row={row}
                  selected={false}
                  onSelect={() => {}}
                />
              ))}
            </Frame>
            <Foot report={report} complete />
          </>
        ) : (
          <Playing
            key={`${report.arxiv_id}-${index}`}
            report={report}
            onDone={() => setIndex((i) => i + 1)}
          />
        )}
      </div>
    </div>
  );
}
