"use client";

import {
  MotionValue,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * The page's scroll vocabulary. Every section builds from these four.
 *
 * The distinction that matters: `Reveal` fires once when an element arrives and
 * then it is over. These are *scrubbed* — the user's scroll position drives the
 * animation frame by frame, so it runs forwards and backwards, stalls when they
 * stall, and compresses when they move fast. `docs/MOTION_TEARDOWN.md` records
 * where that came from: the reference pins a section and advances its internal
 * state against scroll rather than playing a timeline at it.
 *
 * All four collapse to their final state under `prefers-reduced-motion`. Not a
 * shorter animation, no animation: the element paints resolved on the first
 * frame and no scroll listener is attached.
 */

/** Where a scrubbed section is in its own travel, 0 to 1. */
export function useSectionProgress(ref: React.RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({
    target: ref,
    // Starts when the section's top reaches the bottom of the viewport, ends
    // when its bottom reaches the top. The section is "live" exactly while any
    // part of it is on screen.
    offset: ["start end", "end start"],
  });
  return scrollYProgress;
}

/**
 * A section that holds still while its contents advance.
 *
 * `height` is the scroll distance the user spends inside it. 300vh means the pin
 * lasts three screens of scrolling. The sticky child is exactly one viewport, so
 * nothing inside can be taller than the screen without becoming unreachable —
 * that is the one failure mode worth watching for, and it is why this degrades
 * on short viewports rather than pinning anyway.
 */
export function Pin({
  children,
  height = "300vh",
  className,
}: {
  children: (progress: MotionValue<number>) => ReactNode;
  height?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  if (reduced) {
    return (
      <section className={className}>
        <div className="min-h-[100dvh]">{children(constant(1))}</div>
      </section>
    );
  }

  return (
    <section ref={ref} style={{ height }} className={className}>
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        {children(scrollYProgress)}
      </div>
    </section>
  );
}

/**
 * Map a slice of a section's progress onto one element.
 *
 * `from` and `to` are positions in the parent's 0..1 travel, so a stagger is
 * expressed as overlapping windows rather than as delays in milliseconds. That
 * is what makes a fast scroll compress the sequence instead of queueing it.
 */
export function Scrub({
  progress,
  from,
  to,
  y = 24,
  scale,
  blur,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  y?: number;
  scale?: [number, number];
  blur?: number;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  const opacity = useTransform(progress, [from, to], [0, 1], { clamp: true });
  const ty = useTransform(progress, [from, to], [y, 0], { clamp: true });
  const s = useTransform(progress, [from, to], scale ?? [1, 1], { clamp: true });
  const f = useTransform(progress, [from, to], [blur ?? 0, 0], { clamp: true });
  const filter = useTransform(f, (v) => (v > 0.01 ? `blur(${v}px)` : "none"));

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} style={{ opacity, y: ty, scale: s, filter }}>
      {children}
    </motion.div>
  );
}

/**
 * A line that draws itself as the section advances.
 *
 * Wraps an SVG path in a `pathLength` transform, which is how the reference's
 * spine works. Spring-smoothed because a raw scroll value on a stroke reads as
 * jitter on a trackpad.
 */
export function DrawLine({
  progress,
  from,
  to,
  d,
  className,
  strokeWidth = 1,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  d: string;
  className?: string;
  strokeWidth?: number;
}) {
  const reduced = useReducedMotion();
  const raw = useTransform(progress, [from, to], [0, 1], { clamp: true });
  const pathLength = useSpring(raw, { stiffness: 220, damping: 40, mass: 0.4 });

  return (
    <motion.path
      d={d}
      className={className}
      strokeWidth={strokeWidth}
      fill="none"
      style={{ pathLength: reduced ? 1 : pathLength }}
    />
  );
}

/** A MotionValue that never changes. Used to hand `1` to the reduced-motion path. */
function constant(value: number): MotionValue<number> {
  return new MotionValue(value) as MotionValue<number>;
}
