import type { CheckResult, RunReport } from "@/types/run-report";

/**
 * Replay timing for the run view.
 *
 * There is no backend to stream from yet (§11, OWNERSHIP.md), so the streaming
 * behaviour is driven from a fixture on an artificial clock. The point is that
 * the behaviour under review is real: rows appear as their results land, in the
 * order and grouping the checker actually produced them. Nothing here invents a
 * verdict — every verdict shown is the one the checker recorded.
 *
 * Two things about real runs shape this:
 *
 * 1. Checks do not arrive evenly. In the real fixtures the two checks complete
 *    within half a millisecond of each other — they land as a batch. That is
 *    what the §6 stagger is for, and why the schedule is derived from recorded
 *    `created_at` timestamps rather than from a fixed row cadence: rows that
 *    genuinely arrived together are given the same arrival time and the entrance
 *    stagger separates them.
 *
 * 2. Recorded wall-clock is unusable as-is. The local checks finish in 0–4ms,
 *    and the citation lookup in the synthetic fixture takes 41.8 seconds. The
 *    whole timeline is scaled into a watchable range, preserving relative order
 *    and grouping.
 */

/** No replay runs longer than this, however long the recorded run was. */
const TARGET_TOTAL_MS = 5000;
/** How long a row shows its `running` state before resolving. */
const MIN_RUNNING_MS = 420;
const MAX_RUNNING_MS = 1200;
/** Recorded arrivals closer together than this are treated as one batch. */
const BATCH_WINDOW_MS = 50;

/** §6: 60ms between rows entering together. */
export const ROW_STAGGER_MS = 60;

export type StreamState = "pending" | "running" | "done";

export type ScheduledCheck = {
  check: CheckResult;
  /** ms into the replay when the row appears, in its `running` state. */
  startsAt: number;
  /** ms into the replay when the row resolves to its verdict. */
  endsAt: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Recorded ms from the start of the run to each check's completion.
 *
 * `created_at` is the truth when present. The synthetic fixture leaves it null,
 * so that case falls back to accumulating `duration_ms` — which produces a
 * sequential stream rather than a batched one. Both are honest readings of what
 * the fixture actually records; they are not mixed within one run.
 */
function recordedArrivals(report: RunReport, checks: CheckResult[]): number[] {
  const start = report.started_at ? Date.parse(report.started_at) : NaN;
  const haveAll = Number.isFinite(start) && checks.every((c) => c.created_at);

  if (haveAll) {
    return checks.map((c) => Math.max(0, Date.parse(c.created_at!) - start));
  }

  let cursor = 0;
  return checks.map((c) => {
    cursor += Math.max(c.duration_ms ?? 0, 1);
    return cursor;
  });
}

export function buildSchedule(report: RunReport): ScheduledCheck[] {
  const checks = report.checks ?? [];
  if (checks.length === 0) return [];

  const arrivals = recordedArrivals(report, checks);
  const recordedTotal = Math.max(...arrivals, 1);
  const scale = recordedTotal > TARGET_TOTAL_MS ? TARGET_TOTAL_MS / recordedTotal : 1;

  // Snap near-simultaneous arrivals onto a single batch time so they enter
  // together and the stagger has something to stagger.
  let batchAnchor = arrivals[0];
  const batched = arrivals.map((at) => {
    if (at - batchAnchor > BATCH_WINDOW_MS) batchAnchor = at;
    return batchAnchor;
  });

  return checks.map((check, i) => {
    const endsAt = batched[i] * scale;
    const running = clamp((check.duration_ms ?? 0) * scale, MIN_RUNNING_MS, MAX_RUNNING_MS);
    return { check, startsAt: Math.max(0, endsAt - running), endsAt };
  });
}

export function scheduleLength(schedule: ScheduledCheck[]): number {
  return schedule.reduce((max, s) => Math.max(max, s.endsAt), 0);
}

/**
 * The run's real recorded wall-clock duration in seconds — what the elapsed
 * readout settles on. The replay clock interpolates toward this value, so the
 * number the user ends up reading is the one the checker actually took and not
 * the length of the animation.
 */
export function recordedElapsedSeconds(report: RunReport): number {
  if (!report.started_at || !report.finished_at) return 0;
  const ms = Date.parse(report.finished_at) - Date.parse(report.started_at);
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
}
