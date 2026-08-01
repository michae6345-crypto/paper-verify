import { notFound } from "next/navigation";

import { RunView } from "@/components/run/run-view";
import { getReport, listReports } from "@/lib/reports";

export function generateStaticParams() {
  return listReports().map((r) => ({ id: r.arxiv_id }));
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();

  return <RunView report={report} />;
}
