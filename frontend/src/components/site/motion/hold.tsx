"use client";

import { MotionValue, motion, useTransform } from "motion/react";
import { useMemo, type ReactNode } from "react";

import { EASE, LINEAR, type Curve } from "@/components/site/motion/easing";
import { useReducedMotionGate } from "@/components/site/motion/scrub";

/**
 * An element that arrives, holds, and then leaves.
 *
 * `Scrub` maps one window: the element comes in and stays in, for ever, at
 * whatever progress the section reaches. That is right for a section the reader
 * scrolls past, and it is wrong for a `Pin`. A pinned frame has a *release* — the
 * moment the sticky child stops being stuck and the whole assembly scrolls away
 * — and everything inside it is still at full opacity when that happens, so the
 * frame does not hand off so much as get yanked. `MOTION_TEARDOWN.md` §1 records
 * that the reference does not do this: at ~0.80 "the assembly translates up. The
 * headline rises with it — the pin is releasing." The release is authored.
 *
 * This is that, as a second window on the same track.
 *
 * ```tsx
 * <Pin height="300vh">
 *   {(p) => (
 *     <Hold progress={p} from={0.05} to={0.25} exitFrom={0.86} exitTo={1}>
 *       <PipelineSpine />
 *     </Hold>
 *   )}
 * </Pin>
 * ```
 *
 * Both windows are places in the parent's travel, exactly as `Scrub`'s are, so
 * an exit is scrubbed like everything else: it runs backwards if the reader
 * scrolls back up, and it stalls if they stall. It is not a transition fired by
 * a threshold.
 *
 * ---
 *
 * **The easing on the two ends is deliberately not symmetric, and this is the
 * part worth reading.** `motion/easing.ts` states the rule that an in-curve on
 * anything carrying opacity reproduces the "invisible while on screen" bug: the
 * element sits at nearly its start value for most of its window. That rule is
 * about *arrival*. On exit the direction reverses — an in-curve means the
 * element holds full opacity through most of the window and then goes, which is
 * the safe direction, because the failure it risks is the reader seeing the
 * content for slightly too long rather than not at all.
 *
 * So the enter default is `EASE.arrive` (front-loaded, resolved early) and the
 * exit default is `EASE.travel` (still at both ends, holds then leaves). The one
 * thing you should not do is pass an out-curve as `exitEase`: that drops the
 * element's opacity almost immediately when the exit window opens and then
 * spends the rest of the window fading from 0.03 to 0, which reads as a cut.
 *
 * **`exitY` defaults to negative** — the assembly leaves *upward*, in the
 * direction the page is already moving. A pinned frame that releases by sinking
 * is fighting the scroll.
 *
 * Under the motion gate this renders the held state: arrived, not exited. A
 * reader who asked for less motion should get the content, and the content is
 * what the element looks like in the middle of its life rather than at either
 * end. Same reasoning as `Cover`, which resolves to the covering panel.
 */
export function Hold({
  progress,
  from,
  to,
  exitFrom,
  exitTo,
  y = 24,
  exitY = -24,
  scale,
  blur,
  ease = EASE.arrive,
  exitEase = EASE.travel,
  className,
  children,
}: {
  progress: MotionValue<number>;
  /** Where the arrival opens, in the parent's travel. */
  from: number;
  /** Where the arrival closes. */
  to: number;
  /** Where the departure opens. Omit both and this behaves as a `Scrub`. */
  exitFrom?: number;
  /** Where the departure closes. On a `Pin`, this is 1. */
  exitTo?: number;
  /** Pixels risen through on the way in. */
  y?: number;
  /** Pixels travelled on the way out. Negative is upward, and is the default. */
  exitY?: number;
  /** Entered scale, `[start, end]`. The reference uses ~0.96 → 1 and no more. */
  scale?: [number, number];
  /** Blur on arrival only. There is no exit blur; §4 uses blur once on the page. */
  blur?: number;
  ease?: Curve;
  exitEase?: Curve;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotionGate();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <HeldBox
      progress={progress}
      from={from}
      to={to}
      exitFrom={exitFrom}
      exitTo={exitTo}
      y={y}
      exitY={exitY}
      scale={scale}
      blur={blur}
      ease={ease}
      exitEase={exitEase}
      className={className}
    >
      {children}
    </HeldBox>
  );
}

/**
 * Build the input range, and refuse to build a broken one.
 *
 * Motion's interpolator requires a monotonically increasing input range, and an
 * exit that opens before the arrival has closed produces a range that doubles
 * back. What it does then is not an error — it silently reverses both arrays and
 * maps garbage — so this clamps, and says so in development. A silent
 * correction on its own would be the shape of bug `CLAUDE.md` names: a lossy
 * read that produces a confident wrong answer.
 */
function buildRange(
  from: number,
  to: number,
  exitFrom: number | undefined,
  exitTo: number | undefined,
): { input: number[]; hasExit: boolean } {
  if (exitFrom === undefined || exitTo === undefined) return { input: [from, to], hasExit: false };

  const start = Math.max(exitFrom, to);
  const end = Math.max(exitTo, start + 1e-4);

  if (process.env.NODE_ENV !== "production" && (start !== exitFrom || end !== exitTo)) {
    console.warn(
      `[Hold] The exit window (${exitFrom} → ${exitTo}) opens before the arrival ` +
        `closes (${to}). It has been clamped to ${start} → ${end}; the element will ` +
        `hold for no scroll distance at all. Move the two windows apart.`,
    );
  }

  return { input: [from, to, start, end], hasExit: true };
}

function HeldBox({
  progress,
  from,
  to,
  exitFrom,
  exitTo,
  y,
  exitY,
  scale,
  blur,
  ease,
  exitEase,
  className,
  children,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  exitFrom?: number;
  exitTo?: number;
  y: number;
  exitY: number;
  scale?: [number, number];
  blur?: number;
  ease: Curve;
  exitEase: Curve;
  className?: string;
  children: ReactNode;
}) {
  const { input, hasExit } = useMemo(
    () => buildRange(from, to, exitFrom, exitTo),
    [from, to, exitFrom, exitTo],
  );

  /**
   * One easing function per *segment*, and the length matters more than it
   * looks. `useTransform`'s `ease`, given an array, falls back to Motion's
   * internal `noop` for any index it does not cover — and `noop` returns
   * `undefined`, not its input, so an under-length array turns those segments
   * into `NaN` and the element disappears. The middle segment holds a constant,
   * so its curve is irrelevant and `LINEAR` is there to occupy the slot.
   */
  const curve = useMemo(
    () => (hasExit ? [ease, LINEAR, exitEase] : ease),
    [hasExit, ease, exitEase],
  );

  const options = useMemo(() => ({ clamp: true, ease: curve }), [curve]);

  // The scale and the blur resolve on arrival and then stay resolved: the
  // element leaves at the size it settled at, translating and fading only. A
  // surface that also shrinks on the way out reads as being thrown away rather
  // than as the page moving on past it.
  const [s0, s1] = scale ?? [1, 1];
  const b0 = blur ?? 0;

  const opacity = useTransform(progress, input, hasExit ? [0, 1, 1, 0] : [0, 1], options);
  const ty = useTransform(progress, input, hasExit ? [y, 0, 0, exitY] : [y, 0], options);
  const s = useTransform(progress, input, hasExit ? [s0, s1, s1, s1] : [s0, s1], options);
  const b = useTransform(progress, input, hasExit ? [b0, 0, 0, 0] : [b0, 0], options);
  const filter = useTransform(b, (v) => (v > 0.01 ? `blur(${v}px)` : "none"));
  const pointerEvents = useTransform(opacity, (v) => (v > 0 ? "auto" : "none"));

  return (
    <motion.div
      data-scrub=""
      className={className}
      style={{ opacity, y: ty, scale: s, filter, pointerEvents }}
    >
      {children}
    </motion.div>
  );
}
