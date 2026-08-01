import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { RunReport, Verdict } from "@/types/run-report";
import { VERDICT_RANK } from "@/lib/verdict";

/**
 * Static fixtures only. There is no API yet, by design — §11 forbids wiring a
 * UI to the checker before the checker is proven, and OWNERSHIP.md holds Agent E
 * to static `RunReport` files. When the FastAPI SSE endpoint lands, this module
 * is the single place that changes: same return types, different source.
 *
 * Server-side only. Import it from server components; pass the plain objects
 * down to client components as props.
 */

/**
 * Vendored copies of `fixtures/reports/`, kept in step by
 * `npm run fixtures:sync` and checked in CI.
 *
 * This deliberately does not reach outside the Next.js root. Vercel builds the
 * app from `frontend/`, so `../fixtures` does not exist there — reading it
 * failed the first production deploy with ENOENT on `/vercel/fixtures/reports`.
 */
const REPORTS_DIR = join(process.cwd(), "src", "fixtures", "reports");

/** The synthetic fixture is a development instrument, not a real paper. */
export const SYNTHETIC_ID = "0000.00000";

function read(file: string): RunReport {
  return JSON.parse(readFileSync(join(REPORTS_DIR, file), "utf8")) as RunReport;
}

export function listReports(): RunReport[] {
  const files = readdirSync(REPORTS_DIR).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".schema.json"),
  );
  return files
    .map(read)
    .sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""));
}

/**
 * Looked up by `arxiv_id`, not by filename — `synthetic.json` holds arxiv_id
 * `0000.00000`, so the two do not always agree. The field is the contract; the
 * filename is not.
 */
export function getReport(arxivId: string): RunReport | null {
  return listReports().find((r) => r.arxiv_id === arxivId) ?? null;
}

/**
 * The verdicts of a run in fixed order, for the glyph strip. Sorting by
 * VERDICT_RANK rather than by run order means the same run always produces the
 * same fingerprint, and the most consequential mark is leftmost.
 */
export function verdictStrip(report: RunReport): Verdict[] {
  return (report.checks ?? [])
    .map((c) => c.verdict)
    .sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b]);
}

/** ISO instant → `2026-08-01`. Formatted on the server so it cannot drift
 *  between server and client renders. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function elapsedSeconds(report: RunReport): number | null {
  if (!report.started_at || !report.finished_at) return null;
  const ms = Date.parse(report.finished_at) - Date.parse(report.started_at);
  return Number.isFinite(ms) ? ms / 1000 : null;
}
