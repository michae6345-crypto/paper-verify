"use client";

import { useReducedMotion } from "motion/react";

import type { Reading as ReadingData } from "./reading-data";
import { ReadingScene } from "./reading-scene";

/**
 * The reading's reduced-motion boundary. Same shape as the hero's, and for the
 * same reason: remounting on the flip keeps the source motion value constant for
 * the lifetime of a mount, and `scene.module.css` covers the first paint before
 * any of this has run.
 */
export function Reading({ data }: { data: ReadingData }) {
  const reduced = useReducedMotion();
  return <ReadingScene key={String(reduced)} reduced={Boolean(reduced)} data={data} />;
}
