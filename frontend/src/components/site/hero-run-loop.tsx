"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Ledger } from "@/components/ledger/ledger";
import { deriveMarks } from "@/components/gutter/marks";
import { useCheckStream } from "@/hooks/use-check-stream";
import type { RunReport } from "@/types/run-report";

/**
 * What sits beside the headline: the product's claims ledger, playing real
 * recorded runs.
 *
 * This is the `Ledger` the report page mounts, not a lookalike, and it carries
 * the one motion the product has — rows settling into their verdict groups on a
 * shared `layoutId` as each check resolves (DESIGN_PLAN.md, "Motion"). The site
 * adds no second animation, so what a visitor watches here is what they get.
 *
 * Nothing is staged. Every row, verdict, reason and locator comes from
 * `fixtures/reports/*.json`, the committed output of the real checker on real
 * papers. ResNet's run really does move fifteen tables out of Verified and into
 * Unverifiable when `row_arithmetic` reports that it could not read their
 * structure, and that is left on screen: a run that mostly declines is the
 * normal result, not a failure to hide.
 *
 * There is never an empty frame. A run has no claims until its first check
 * resolves, which is about 1.2 seconds, and the ledger's own empty state says
 * the paper pane still shows what the parser read — true in the report view,
 * false here, where there is no paper pane. So the first paper is shown already
 * resolved (which is also what the server renders, so nothing shifts on load),
 * and every paper after it holds the previous run on screen until its own first
 * verdict lands.
 *
 * Under `prefers-reduced-motion` the loop stops entirely: one run, all checks
 * resolved, nothing cycling.
 */

/** How long a finished run holds before the next paper starts. */
const HOLD_MS = 3200;

function resolvedMarks(report: RunReport) {
  return deriveMarks(report);
}

export function HeroRunLoop({ reports }: { reports: RunReport[] }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  const count = reports.length || 1;
  const report = reports[index % count] ?? reports[0];
  // The run still on screen while the next one has nothing to show yet.
  const previous = reports[(index - 1 + count) % count] ?? report;

  const { rows, complete } = useCheckStream(report, index);

  useEffect(() => {
    if (!complete || reduced) return;
    const id = window.setTimeout(() => setIndex((i) => i + 1), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [complete, reduced, index]);

  // The ledger is built from the checks that have landed, exactly as it would be
  // mid-run against the SSE stream. A check still running contributes nothing —
  // §5.3 is explicit that the list is never rendered in advance.
  const partial = useMemo<RunReport>(
    () => ({
      ...report,
      checks: rows.filter((r) => r.state === "done").map((r) => r.check),
      not_checked: complete ? report.not_checked : [],
    }),
    [report, rows, complete],
  );

  const partialMarks = useMemo(() => deriveMarks(partial), [partial]);

  const holding = reduced || index === 0 || partialMarks.length === 0;
  const held = reduced || index === 0 ? report : previous;
  const heldMarks = useMemo(() => resolvedMarks(held), [held]);

  const shown = holding ? held : partial;
  const shownMarks = holding ? heldMarks : partialMarks;

  if (reports.length === 0) return null;

  return (
    <div
      className="overflow-hidden border"
      style={{
        borderColor: "var(--chrome-line)",
        borderRadius: "var(--radius-panel)",
        background: "var(--chrome-panel)",
      }}
    >
      {/* A picture of the report view, not a control surface: its rows are real
          ledger buttons, so the whole thing is taken out of the tab order and
          described in text instead. */}
      <span className="sr-only">
        A looping miniature of the claims ledger, replaying the checker&rsquo;s recorded output on{" "}
        {reports.length} papers from the validation corpus.
      </span>

      <div inert aria-hidden="true" className="h-[380px] two:h-[440px]">
        <Ledger
          report={shown}
          marks={shownMarks}
          selectedKey={null}
          reduced={Boolean(reduced)}
          onSelect={() => {}}
          instance="site"
          className="h-full"
        />
      </div>
    </div>
  );
}
