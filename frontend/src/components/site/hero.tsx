"use client";

import { useReducedMotion } from "motion/react";

import { HeroScene, type HeroCard, type HeroStage } from "./hero-scene";

/**
 * The hero's reduced-motion boundary.
 *
 * `useReducedMotion()` returns `null` until it has consulted the media query, so
 * the value flips once shortly after hydration. Remounting the scene on that
 * flip is deliberate: it keeps the source motion value constant for the lifetime
 * of a mount, which is what makes every `useTransform` below it reliable.
 *
 * The visual half of the guard is in `scene.module.css` rather than here,
 * because "immediately" has to mean the first paint and not the first effect.
 * Under the query the track collapses, the pin stops pinning, and every scrubbed
 * element is forced to its final state before any JavaScript has run.
 */
export function Hero(props: { stages: HeroStage[]; card: HeroCard; papers: number; tables: number }) {
  const reduced = useReducedMotion();
  return <HeroScene key={String(reduced)} reduced={Boolean(reduced)} {...props} />;
}
