import { notFound } from "next/navigation";

import { RunView } from "@/components/run/run-view";
import { getReport, listReports } from "@/lib/reports";
import { stripLatex } from "@/components/document/strip-latex";

export function generateStaticParams() {
  return listReports().map((r) => ({ id: r.arxiv_id }));
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();

  // The run view renders the paper now, so it ships the same projection the
  // report does: every table, no `latex_source`.
  return <RunView report={stripLatex(report)} />;
}
