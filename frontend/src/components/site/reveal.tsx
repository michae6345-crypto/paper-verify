"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useReducedMotionGate } from "@/components/site/motion/scrub";

/**
 * The page's one reveal.
 *
 * The reference animates almost everything the same way — 48px up, fading in,
 * once, when the element first enters the viewport — and the hero's version of
 * it is the same gesture fired on load rather than on scroll. `whileInView` with
 * `once` covers both: an element already on screen at mount reveals immediately,
 * and everything below reveals as it arrives.
 *
 * `amount: 0.2` rather than the default, so a tall card starts moving when a
 * fifth of it is visible instead of waiting for its foot to clear the fold.
 *
 * Under `prefers-reduced-motion` there is no initial state and no variant to
 * transition to: the element renders at its final value, and the observer that
 * would have watched it is never given a chance to fire. Not a faster animation —
 * no animation.
 *
 * The gate is `useReducedMotionGate` from `motion/scrub`, not `useReducedMotion`
 * from `motion/react`, and the module comment there explains at length why the
 * difference is not cosmetic. The short version: `useReducedMotion` resolves to
 * `null` on the server and to the truth on the client's first render, so a
 * component that picks between two different trees with it renders one thing on
 * the server and another during hydration. React reconciles hydration on element
 * type, not on attributes, so the server's `style="opacity:0;transform:
 * translateY(48px)"` would survive onto a node the client believes has no style
 * at all — and with nothing left to trigger a re-render, it would stay there.
 * Every `Reveal` on the page invisible, for precisely the readers who asked for
 * less motion. The gate reads `false` until a layout effect has run, so server
 * and hydration agree and the swap lands before the first paint.
 *
 * Worth knowing and not fixed here: because the animated branch is what the
 * server emits, a reader whose JavaScript never arrives gets a page of
 * `opacity: 0`. That is a `@media (prefers-reduced-motion: reduce)` and
 * `<noscript>` pair in `globals.css`, which this workstream does not own; it is
 * in the report.
 *
 * ---
 *
 * `scale` is opt-in and off by default. `MOTION_TEARDOWN.md` §4 records that
 * cards in the reference enter with opacity *plus* a small scale, ~0.96 → 1, and
 * never slide from far off screen — so a caller revealing a card should pass
 * `scale={0.96}` and bring `y` down to match, because 48px of travel and a scale
 * together is a card being thrown rather than one arriving.
 *
 * It is not the default for the same reason `y` is still 48: this component is
 * also what reveals the hero's headline and its lede, and scaling a 108px
 * headline resamples the type for the length of the tween. The distinction the
 * teardown draws is between surfaces and text, and only the caller knows which
 * it is holding.
 */
export function Reveal({
  children,
  delay = 0,
  y = 48,
  scale,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  scale?: number;
  className?: string;
}) {
  const reduced = useReducedMotionGate();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      data-scrub=""
      className={className}
      initial={{ opacity: 0, y, scale }}
      whileInView={{ opacity: 1, y: 0, scale: scale === undefined ? undefined : 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
