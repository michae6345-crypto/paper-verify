"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CheckResult, RunReport } from "@/types/run-report";
import { buildSchedule, scheduleLength, type StreamState } from "@/lib/stream";

export type StreamRow = {
  check: CheckResult;
  state: Exclude<StreamState, "pending">;
  /**
   * Position of this row within the batch it arrived in. Drives the §6 entrance
   * stagger — rows that landed together are offset 60ms apart; a row arriving
   * alone has index 0 and no delay.
   */
  batchIndex: number;
};

/** The replay clock, tagged with the replay it belongs to. Tagging rather than
 *  resetting keeps the reset out of the effect body: a tick from the previous
 *  replay simply reads as time zero. */
type Tick = { key: number; t: number };

/**
 * Plays a recorded run back as if it were arriving.
 *
 * Returns only the rows that have started. §5.3 is explicit: never render the
 * full list greyed out in advance — the user should watch the work accumulate.
 */
export function useCheckStream(report: RunReport, replayKey: number) {
  const schedule = useMemo(() => buildSchedule(report), [report]);
  const total = useMemo(() => scheduleLength(schedule), [schedule]);

  const [tick, setTick] = useState<Tick>({ key: replayKey, t: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (total === 0) return;

    const started = performance.now();
    const step = () => {
      const t = Math.min(performance.now() - started, total);
      setTick({ key: replayKey, t });
      if (t < total) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [total, replayKey]);

  const now = tick.key === replayKey ? tick.t : 0;

  const rows: StreamRow[] = useMemo(() => {
    const out: StreamRow[] = [];
    let batchAnchor = Number.NaN;
    let batchIndex = 0;

    for (const s of schedule) {
      if (now < s.startsAt) continue;
      if (s.startsAt === batchAnchor) {
        batchIndex += 1;
      } else {
        batchAnchor = s.startsAt;
        batchIndex = 0;
      }
      out.push({
        check: s.check,
        state: now >= s.endsAt ? "done" : "running",
        batchIndex,
      });
    }
    return out;
  }, [schedule, now]);

  return {
    rows,
    progress: total === 0 ? 1 : now / total,
    complete: total === 0 || now >= total,
  };
}

/** The check list of a report, without the replay clock — for non-streaming views. */
export function staticRows(checks: CheckResult[]): StreamRow[] {
  return checks.map((check) => ({ check, state: "done" as const, batchIndex: 0 }));
}
