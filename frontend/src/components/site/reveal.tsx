"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

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
 * transition to: the element renders at its final value on the first paint, and
 * no observer is ever attached. Not a faster animation — no animation.
 */
export function Reveal({
  children,
  delay = 0,
  y = 48,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
