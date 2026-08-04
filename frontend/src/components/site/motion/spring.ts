"use client";

import { MotionValue, useSpring } from "motion/react";
import { useMemo } from "react";

import { SPRING } from "@/components/site/motion/easing";
import { useReducedMotionGate } from "@/components/site/motion/scrub";

/**
 * Smooth a scrubbed value.
 *
 * `DrawLine` is the only thing on this page that springs a scroll value, and its
 * comment explains why it has to: `stroke-dashoffset` is not composited, so a
 * raw trackpad value on a stroke reads as jitter. That reason is not unique to
 * strokes. Anything driven directly off `scrollYProgress` inherits the input
 * device — a wheel that arrives in discrete notches, a trackpad that arrives in
 * a burst and stops, a phone that delivers a fling as a decelerating ramp. A
 * spring between the scroll value and the property is what turns those into one
 * continuous quantity, and it is a large part of what a Framer page is doing
 * that a hand-built one usually is not.
 *
 * ```tsx
 * const p = useSectionProgress(ref);
 * const smooth = useScrubSpring(p);
 * <Scrub progress={smooth} from={0.1} to={0.5} ease={EASE.arrive}>…</Scrub>
 * ```
 *
 * ---
 *
 * **`skipInitialAnimation`, which is not optional here.** A spring fed a value
 * that changes on mount will animate to it from wherever it started. Scroll
 * progress does change on mount — `useScroll` measures its target in an effect,
 * so the first real value arrives after the first render, and on a page loaded
 * at a scroll position that is not the top it can arrive as a large jump. The
 * spring then plays that jump as an animation nobody asked for: every scrubbed
 * element in the section sweeps through its whole window on load. Motion added
 * this flag for exactly this case and its own scroll example passes it.
 *
 * **Bounce is refused, not defaulted.** The presets in `motion/easing.ts` that
 * are legal here are `follow` and `drift`, both critically damped. A spring
 * following a scroll value with bounce overshoots its target, so a line drawing
 * to a node goes past the node and comes back — which reads as the line having
 * missed. `SPRING.settle` has bounce and is for state changes; do not pass it.
 *
 * **The cost, stated.** A spring is a frame loop: it keeps running for as long
 * as it takes to settle after the reader stops. That is the point, and it is
 * also why this is a hook a section opts into rather than something baked into
 * `useSectionProgress`. A `Cover` panel deliberately has no spring, because a
 * spring on a large translate puts a visible lag between the reader's fingers
 * and the thing they are moving.
 *
 * Under the motion gate the input is returned untouched. The spring is still
 * constructed, because a hook cannot be conditional and the gate flips after
 * mount — the same honest caveat `useSectionProgress` makes about its own
 * `useScroll`. It is never read, so nothing schedules from it.
 */
export function useScrubSpring(
  value: MotionValue<number>,
  options: { visualDuration: number; bounce: number } = SPRING.follow,
): MotionValue<number> {
  const reduced = useReducedMotionGate();

  // Memoised on the two numbers rather than on the object, so a caller passing
  // an inline literal does not reconfigure the spring on every render.
  const config = useMemo(
    () => ({
      visualDuration: options.visualDuration,
      bounce: options.bounce,
      skipInitialAnimation: true,
    }),
    [options.visualDuration, options.bounce],
  );

  const smoothed = useSpring(value, config);

  return reduced ? value : smoothed;
}
