import { SYNTHETIC_ID, listReports } from "@/lib/reports";
import type { CheckResult, Finding, RunReport } from "@/types/run-report";

/**
 * The committed run reports, shaped for the site. Server-side only.
 *
 * `synthetic.json` is excluded everywhere on this site. It is a hand-authored
 * fixture for exercising the finding-detail screen, and the paper it describes
 * does not exist — putting it in front of a visitor would be advertising with a
 * fabricated result, which is the one thing this product cannot do.
 *
 * Reports also carry their full parsed `tables` (CLIP's report alone holds 3,326
 * cells). The site never renders a table, so they are stripped before anything
 * crosses to the client.
 */

export type SiteReport = {
  arxiv_id: string;
  title: string;
  tables_parsed: number;
  not_checked: number;
  elapsed_seconds: number;
  checks: CheckResult[];
  started_at: string | null;
  finished_at: string | null;
};

function elapsed(report: RunReport): number {
  if (!report.started_at || !report.finished_at) return 0;
  const ms = Date.parse(report.finished_at) - Date.parse(report.started_at);
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
}

/** Real papers only, oldest arXiv id first so the hero loop has a stable order. */
export function realReports(): SiteReport[] {
  return listReports()
    .filter((r) => r.arxiv_id !== SYNTHETIC_ID)
    .sort((a, b) => a.arxiv_id.localeCompare(b.arxiv_id))
    .map((report) => ({
      arxiv_id: report.arxiv_id,
      title: report.title ?? "",
      tables_parsed: report.tables_parsed ?? 0,
      not_checked: (report.not_checked ?? []).length,
      elapsed_seconds: elapsed(report),
      checks: report.checks ?? [],
      started_at: report.started_at ?? null,
      finished_at: report.finished_at ?? null,
    }));
}

/**
 * The reports the hero replays, as the contract type the `Ledger` takes.
 *
 * Tables are kept but emptied of their cells. The ledger needs each table's
 * label and anchor to place a mark against it, and nothing else; CLIP's report
 * alone carries 3,326 cells, and shipping those to the client to render a list
 * of eight rows would be a megabyte spent on nothing.
 */
export function heroReports(): RunReport[] {
  return listReports()
    .filter((r) => r.arxiv_id !== SYNTHETIC_ID)
    .sort((a, b) => a.arxiv_id.localeCompare(b.arxiv_id))
    .map((report) => ({
      arxiv_id: report.arxiv_id,
      title: report.title ?? "",
      checks: report.checks ?? [],
      not_checked: report.not_checked ?? [],
      tables: (report.tables ?? []).map((t) => ({
        label: t.label,
        anchor: t.anchor,
        caption: "",
        is_nested: t.is_nested,
      })),
      tables_parsed: report.tables_parsed ?? 0,
      started_at: report.started_at ?? null,
      finished_at: report.finished_at ?? null,
    }));
}

export function reportById(arxivId: string): SiteReport | null {
  return realReports().find((r) => r.arxiv_id === arxivId) ?? null;
}

/** The first finding a given checker recorded on a given paper, or null. */
export function findingFrom(arxivId: string, checker: string): Finding | null {
  const check = reportById(arxivId)?.checks.find((c) => c.checker === checker);
  return check?.findings?.[0] ?? null;
}

export function checkFrom(arxivId: string, checker: string): CheckResult | null {
  return reportById(arxivId)?.checks.find((c) => c.checker === checker) ?? null;
}
