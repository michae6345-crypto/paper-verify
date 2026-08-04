import { SYNTHETIC_ID, listReports } from "@/lib/reports";
import type { CheckResult, Finding, NotChecked1, RunReport, Verdict } from "@/types/run-report";

/**
 * Everything the dashboard is allowed to say, read off the committed fixtures.
 *
 * Server-side only, and deliberately the same door `components/site/corpus.server.ts`
 * uses: `lib/reports.ts` reads `src/fixtures/reports/*.json`, which are the real
 * `RunReport`s the CLI wrote on 2026-08-01. There is no API for this surface yet,
 * so **there is nothing else here to read.** Every count, timestamp, duration and
 * identifier on the dashboard comes through this module, and if a panel wants a
 * number this module cannot produce, the panel renders an empty state instead.
 * That rule is the point: a dashboard full of plausible-looking metrics is the
 * one thing this product cannot ship.
 *
 * `synthetic.json` is excluded for the reason `corpus.server.ts` gives — it is a
 * hand-authored fixture describing a paper that does not exist. It is excluded
 * here too even though this surface is private: a run row that looks like the
 * other four and is not a real run is exactly the confusion the product exists
 * to argue against, and a private screen is still a screen someone reads a
 * number off.
 */

/** The four verdicts plus `not_attempted`, in §7 order, so counts read the same everywhere. */
export const VERDICT_ORDER: Verdict[] = [
  "matches",
  "within_tolerance",
  "diverges",
  "unverifiable",
  "not_attempted",
];

export type VerdictCounts = Record<Verdict, number>;

export type DashboardRun = {
  arxivId: string;
  title: string;
  /**
   * The heading name. Papers whose title carries a `name: subtitle` form get the
   * name ("BERT"); the others keep the whole title and are truncated by CSS.
   * Derived from the fixture's own `title`, never a nickname typed here.
   */
  shortName: string;
  /**
   * `complete` when the report records both a start and a finish, which all four
   * committed reports do. Nothing here invents a live stage: `queued`,
   * `resolving`, `checking` and the rest of §14.2's machine belong to a run in
   * flight, and a committed fixture is never in flight.
   */
  stage: "complete" | "unrecorded";
  startedAt: string | null;
  finishedAt: string | null;
  /** `2026-08-01 12:26:09`, sliced out of the ISO string rather than parsed, so
   *  server and client cannot disagree about a timezone. Every fixture is UTC. */
  startedDisplay: string | null;
  finishedDisplay: string | null;
  elapsedSeconds: number | null;
  tablesParsed: number;
  checks: CheckResult[];
  notChecked: NotChecked1[];
  findingCount: number;
  counts: VerdictCounts;
  amendmentCount: number;
};

function emptyCounts(): VerdictCounts {
  return {
    matches: 0,
    within_tolerance: 0,
    diverges: 0,
    unverifiable: 0,
    not_attempted: 0,
  };
}

function shortName(title: string): string {
  const colon = title.indexOf(":");
  if (colon > 0 && colon <= 24) return title.slice(0, colon);
  return title;
}

/** `2026-08-01T12:26:09.502493Z` → `2026-08-01 12:26:09`. No `Date`, no drift. */
function stamp(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 19) return null;
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function elapsed(report: RunReport): number | null {
  if (!report.started_at || !report.finished_at) return null;
  const ms = Date.parse(report.finished_at) - Date.parse(report.started_at);
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
}

function toRun(report: RunReport): DashboardRun {
  const checks = report.checks ?? [];
  const counts = emptyCounts();
  for (const check of checks) counts[check.verdict] += 1;

  return {
    arxivId: report.arxiv_id,
    title: report.title ?? "",
    shortName: shortName(report.title ?? report.arxiv_id),
    stage: report.started_at && report.finished_at ? "complete" : "unrecorded",
    startedAt: report.started_at ?? null,
    finishedAt: report.finished_at ?? null,
    startedDisplay: stamp(report.started_at),
    finishedDisplay: stamp(report.finished_at),
    elapsedSeconds: elapsed(report),
    tablesParsed: report.tables_parsed ?? 0,
    checks,
    notChecked: report.not_checked ?? [],
    findingCount: checks.reduce((n, c) => n + (c.findings ?? []).length, 0),
    counts,
    amendmentCount: (report.amendments ?? []).length,
  };
}

/**
 * Every committed run, newest first. `listReports` already sorts by
 * `finished_at` descending; this keeps that order rather than re-deriving one,
 * so the run list reads the way §5.1's recently-checked table does.
 */
export function dashboardRuns(): DashboardRun[] {
  return listReports()
    .filter((r) => r.arxiv_id !== SYNTHETIC_ID)
    .map(toRun);
}

export function dashboardRun(arxivId: string): DashboardRun | null {
  return dashboardRuns().find((r) => r.arxivId === arxivId) ?? null;
}

export type WorkspaceTotals = {
  runs: number;
  papers: number;
  checksRecorded: number;
  findings: number;
  tablesParsed: number;
  notCheckedEntries: number;
  amendments: number;
  counts: VerdictCounts;
  /** Wall-clock seconds the four runs took, summed. */
  totalSeconds: number;
  /** The window the corpus was produced in, as two display stamps. */
  firstStarted: string | null;
  lastFinished: string | null;
};

export function workspaceTotals(): WorkspaceTotals {
  const runs = dashboardRuns();
  const counts = emptyCounts();
  for (const run of runs) {
    for (const verdict of VERDICT_ORDER) counts[verdict] += run.counts[verdict];
  }

  const started = runs.map((r) => r.startedAt).filter((s): s is string => !!s).sort();
  const finished = runs.map((r) => r.finishedAt).filter((s): s is string => !!s).sort();

  return {
    runs: runs.length,
    papers: new Set(runs.map((r) => r.arxivId)).size,
    checksRecorded: runs.reduce((n, r) => n + r.checks.length, 0),
    findings: runs.reduce((n, r) => n + r.findingCount, 0),
    tablesParsed: runs.reduce((n, r) => n + r.tablesParsed, 0),
    notCheckedEntries: runs.reduce((n, r) => n + r.notChecked.length, 0),
    amendments: runs.reduce((n, r) => n + r.amendmentCount, 0),
    counts,
    totalSeconds: runs.reduce((n, r) => n + (r.elapsedSeconds ?? 0), 0),
    firstStarted: stamp(started[0]),
    lastFinished: stamp(finished[finished.length - 1]),
  };
}

export type CorpusFinding = {
  run: DashboardRun;
  check: CheckResult;
  finding: Finding;
};

/**
 * Every finding in the corpus, which is currently one: BERT's average column,
 * `within tolerance`. Nothing here filters by severity — a dashboard that showed
 * only the loud ones would be reporting a selection, not a corpus.
 */
export function corpusFindings(): CorpusFinding[] {
  const out: CorpusFinding[] = [];
  for (const run of dashboardRuns()) {
    for (const check of run.checks) {
      for (const finding of check.findings ?? []) out.push({ run, check, finding });
    }
  }
  return out;
}

/** Each shipped checker's recorded result on each paper, for the tests surface. */
export type CheckerResult = { run: DashboardRun; check: CheckResult };

export function resultsForChecker(checker: string): CheckerResult[] {
  const out: CheckerResult[] = [];
  for (const run of dashboardRuns()) {
    const check = run.checks.find((c) => c.checker === checker);
    if (check) out.push({ run, check });
  }
  return out;
}

/**
 * Seconds → `3.44s`. Two places, because the fastest run here is 1.32s.
 *
 * No space before the unit. At the 24px mono the stat tiles are set in, a normal
 * space between the number and the `s` opens to about half an em and reads as a
 * typo rather than as a unit.
 */
export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${seconds.toFixed(2)}s`;
}

/** Milliseconds → `11 ms`. The checkers record integers; keep them integers. */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return `${ms} ms`;
}
