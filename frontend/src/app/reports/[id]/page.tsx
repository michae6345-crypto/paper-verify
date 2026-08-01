import { notFound } from "next/navigation";

import type { RunReport } from "@/types/run-report";
import { getReport, listReports } from "@/lib/reports";
import { ReportView } from "./report-view";

/**
 * §5.5's permalink. Statically generated from the same fixtures as the run view.
 */
export function generateStaticParams() {
  return listReports().map((r) => ({ id: r.arxiv_id }));
}

/**
 * `Table.latex_source` and `Cell.raw_latex` are the parser's working material,
 * not the document pane's. They are also most of the payload: CLIP's report is
 * 1.4MB and about 1.2MB of it is LaTeX nobody renders. Dropping them here keeps
 * the whole report — every table, every cell, every column — while shipping a
 * fraction of the bytes to the client.
 *
 * This is a projection, not a truncation. No table, row, column, or cell is
 * removed, and nothing the UI reads is touched. A document pane that quietly
 * dropped tables to stay fast would be the same lossy narrowing this codebase
 * keeps producing, in a new place.
 */
function stripLatex(report: RunReport): RunReport {
  return {
    ...report,
    tables: (report.tables ?? []).map((table) => ({
      ...table,
      latex_source: "",
      cells: (table.cells ?? []).map((cell) => ({ ...cell, raw_latex: "" })),
    })),
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();

  return <ReportView report={stripLatex(report)} />;
}
