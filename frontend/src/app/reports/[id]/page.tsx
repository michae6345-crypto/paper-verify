import { notFound } from "next/navigation";

import { getReport, listReports } from "@/lib/reports";
import { stripLatex } from "@/components/document/strip-latex";
import { ReportView } from "./report-view";

/**
 * §5.5's permalink. Statically generated from the same fixtures as the run view.
 */
export function generateStaticParams() {
  return listReports().map((r) => ({ id: r.arxiv_id }));
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();

  return <ReportView report={stripLatex(report)} />;
}
