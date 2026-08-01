"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

/**
 * The scrubbing primitives both pinned scenes share.
 *
 * One rule holds all of it together: a scene never has a duration. Every element
 * maps a slice of the section's scroll progress onto one property, so the user
 * sets the pace and the sequence can be run backwards, stopped halfway, or
 * finished in a flick. Nothing is queued and nothing can be missed by scrolling
 * past it faster than a tween.
 *
 * `reduced` is passed in rather than read here, and the scene component is
 * remounted when it flips (see `hero.tsx`). That keeps the source motion value
 * constant for the lifetime of a mount, which is the difference between a
 * transform that reliably re-subscribes and one that quietly stops updating.
 */

/**
 * When a scene is allowed to pin, kept in step with `scene.module.css` by hand.
 * A pinned panel taller than the viewport has a lower half nobody can scroll to,
 * and these scenes do not fit a phone.
 */
export const SCRUB_QUERY = "(min-width: 1100px) and (min-height: 640px)";

/**
 * Whether this scene is actually scrubbing. The stylesheet already knows, and
 * knew before hydration; this is for the one thing a stylesheet cannot express —
 * a block of links that leaves the tab order while it is invisible, and must not
 * leave it on a screen where it was visible all along.
 */
export function useScrubbing(reduced: boolean): boolean {
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const query = window.matchMedia(SCRUB_QUERY);
    const sync = () => setScrubbing(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [reduced]);

  return scrubbing;
}

/**
 * Progress through a pinned section: 0 when its top reaches the top of the
 * viewport, 1 when its bottom reaches the bottom. Under reduced motion this is a
 * constant 1, so every element below sits at its final value from the first
 * render and no scroll listener is ever consulted.
 */
export function useTrackProgress(
  ref: RefObject<HTMLElement | null>,
  reduced: boolean,
): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const settled = useMotionValue(1);
  return reduced ? settled : scrollYProgress;
}

/** One element's slice of the sequence, clamped at both ends. */
export function useStage(
  progress: MotionValue<number>,
  from: number,
  to: number,
  out: [number, number],
): MotionValue<number> {
  return useTransform(progress, [from, to], out, { clamp: true });
}

/**
 * Whether progress has passed a point, as React state rather than as a motion
 * value. Used for the one thing a motion value cannot express: taking a block of
 * links out of the tab order while it is still invisible, so a keyboard user is
 * never focused on something nobody can see.
 */
export function usePassed(progress: MotionValue<number>, at: number): boolean {
  const [passed, setPassed] = useState(() => progress.get() >= at);
  useMotionValueEvent(progress, "change", (v) => setPassed(v >= at));
  return passed;
}
