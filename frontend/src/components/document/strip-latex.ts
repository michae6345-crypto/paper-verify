import type { RunReport } from "@/types/run-report";

/**
 * `Table.latex_source` and `Cell.raw_latex` are the parser's working material,
 * not the document pane's. They are also most of the payload: CLIP's report is
 * 1.4MB and about 1.2MB of it is LaTeX nobody renders. Dropping them keeps the
 * whole report — every table, every cell, every column — while shipping a
 * fraction of the bytes to the client.
 *
 * This is a projection, not a truncation. No table, row, column, or cell is
 * removed, and nothing the UI reads is touched. A document pane that quietly
 * dropped tables to stay fast would be the same lossy narrowing this codebase
 * keeps producing, in a new place.
 *
 * It lived in `app/reports/[id]/page.tsx` and is shared now because the run view
 * renders the same paper and needs the same projection. One copy, so the two
 * routes cannot start disagreeing about what reaches the client.
 */
export function stripLatex(report: RunReport): RunReport {
  return {
    ...report,
    tables: (report.tables ?? []).map((table) => ({
      ...table,
      latex_source: "",
      cells: (table.cells ?? []).map((cell) => ({ ...cell, raw_latex: "" })),
    })),
  };
}
