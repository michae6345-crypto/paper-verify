"use client";

import { forwardRef, useMemo } from "react";

import type { RunReport, Verdict } from "@/types/run-report";
import { marksByTable, tableDomIds, type Mark } from "@/components/gutter/marks";
import { PaperTable } from "./paper-table";

/**
 * The document pane (§4): always light, always serif, never inverts. One half of
 * §2's two materials — the paper as an artifact, held against the instrument.
 *
 * What it renders is what the checker read: the paper's title and every table it
 * parsed, with a stable DOM id on every cell so the gutter has something exact to
 * align to. `RunReport` carries no abstract and no body prose, so neither is
 * shown. That absence is stated in the page rather than papered over — a document
 * pane that invented running text would be the same lossy narrowing this codebase
 * keeps producing, only in reverse.
 *
 * §3 gives the paper three colours and no secondary ink, so quieter text on this
 * surface is `--paper-ink` at reduced opacity rather than a fourth colour.
 */
export const DocumentView = forwardRef<
  HTMLDivElement,
  {
    report: RunReport;
    marks: Mark[];
    selectedDomId: string | null;
    selectedVerdict: Verdict | null;
    reduced: boolean;
    onSelect: (key: string) => void;
  }
>(function DocumentView(
  { report, marks, selectedDomId, selectedVerdict, reduced, onSelect },
  ref,
) {
  const tables = useMemo(
    () => (report.tables ?? []).filter((t) => !t.is_nested),
    [report.tables],
  );
  const byTable = useMemo(() => marksByTable(marks), [marks]);
  // The same list the marks were derived against, so a mark's `domId` and the
  // element's `id` cannot drift apart when two tables share a label.
  const ids = useMemo(() => tableDomIds(tables), [tables]);

  return (
    <div
      ref={ref}
      className="h-full overflow-y-auto"
      style={{ background: "var(--paper)" }}
      aria-label="Paper"
    >
      <article className="measure-doc mx-auto px-5 py-10 t-doc two:px-8">
        <h1 className="text-[26px] leading-[1.25] font-semibold">
          {report.title || "Untitled paper"}
        </h1>
        <p className="mt-3 t-num" style={{ color: "var(--paper-ink)", opacity: 0.55 }}>
          arXiv:{report.arxiv_id}
        </p>

        <hr className="my-8 border-0 border-t" style={{ borderColor: "var(--paper-rule)" }} />

        {tables.length === 0 ? (
          <p style={{ opacity: 0.72 }}>
            No tables were parsed from this paper&apos;s source, so there is nothing here to
            align marks to. The run rail still lists what each check was able to say.
          </p>
        ) : (
          <>
            <p style={{ opacity: 0.72 }}>
              {/* Deliberately not "in the margin": below 760px there is no
                  margin, and the marks sit in the cells themselves. */}
              {tables.length === 1 ? "The one table" : `The ${tables.length} tables`} the
              checker parsed from the LaTeX source, as it read them. Each mark points at the
              cell a check looked at.
            </p>

            {tables.map((table, i) => {
              const id = ids[i];
              return (
                <PaperTable
                  key={id}
                  table={table}
                  index={i}
                  tableId={id}
                  marks={byTable.get(i) ?? []}
                  selectedDomId={selectedDomId}
                  selectedVerdict={selectedVerdict}
                  reduced={reduced}
                  onSelect={onSelect}
                />
              );
            })}
          </>
        )}

        {/* Room to scroll the last table up to reading position, so a mark on it
            can sit level with its cell rather than pinned to the bottom edge. */}
        <div aria-hidden className="h-[40dvh]" />
      </article>
    </div>
  );
});
