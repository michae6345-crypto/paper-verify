/**
 * Stagger, as overlapping windows.
 *
 * `MOTION_TEARDOWN.md` §4: "stagger is measured in scroll distance, not
 * milliseconds. Items within a group overlap heavily; groups are clearly
 * separated." Every section on this page implements that correctly and every
 * section implements it *again*, by hand, with its own arithmetic and its own
 * constants. This is that arithmetic, once.
 *
 * It is deliberately pure — no hooks, no React, no measurement. It takes a span
 * of somebody else's 0..1 travel and cuts it up. Where that span comes from is
 * the caller's problem and is the thing that has to be measured; how it is
 * subdivided is not, and is the same every time.
 *
 * ---
 *
 * **The parameter that matters is `overlap`, and it is the one nobody was
 * naming.** A stagger written as "each item starts 0.04 later than the last and
 * runs for 0.12" has an overlap of 0.67 buried in the ratio of two constants,
 * and changing either one changes both the rhythm and the duration. Stated
 * directly:
 *
 *     overlap = 0     each item finishes before the next begins. A queue. Reads
 *                     as a machine dealing cards, and it is almost never right.
 *     overlap = 0.6   the default. Neighbours are more than half concurrent, so
 *                     a group reads as one gesture with a direction, which is
 *                     what the teardown describes for items *within* a group.
 *     overlap = 0.9   very nearly simultaneous, with just enough lag to give the
 *                     group an edge. For long runs — the apparatus has
 *                     forty-five verdict marks and dealing those in a queue
 *                     would take the whole pin.
 *
 * The span is held fixed as overlap changes: the first item always opens at
 * `from` and the last always closes at `to`. So a consumer tunes the feel
 * without re-deriving where the sequence starts and ends, which is the coupling
 * that made the hand-rolled versions hard to adjust.
 *
 * **What this does not do is choose the span.** `from` and `to` still have to
 * come from measured geometry — a `useOwnTrack` window, a `Pin`'s travel, a
 * measured reading point — for the reason `mobile.tsx` documents at length: a
 * fraction of a section is a different number of pixels on a phone, and that is
 * how thirty of seventy-nine elements ended up animating below the fold. Nothing
 * here can protect a consumer that hands it two numbers it made up.
 */

/** A slice of a parent's 0..1 travel, in the shape `Scrub` and `Stage` take. */
export type ScrubWindow = { from: number; to: number };

/**
 * The most any two neighbours may overlap. At 1.0 every window would be the
 * whole span and the stagger would not exist; the clamp keeps the arithmetic
 * finite and keeps a caller that passes 1 from getting a silently dead sequence.
 */
const MAX_OVERLAP = 0.95;

function clamp01(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

/**
 * Solve for the step and the width, given the number of slots the sequence
 * spans and how much neighbours overlap.
 *
 * With step `s` and width `w`, item `i` runs `[i·s, i·s + w]`. Requiring the
 * last to close exactly at the end of the span gives `slots·s + w = span`, and
 * the definition of overlap gives `w = s / (1 − overlap)`. Two equations, two
 * unknowns.
 *
 * `slots` is the index of the last item, not the count — for a grouped sequence
 * the gaps between groups add slots that no item occupies, which is exactly how
 * a gap is expressed.
 */
function solve(slots: number, span: number, overlap: number): { step: number; width: number } {
  const o = clamp01(overlap, MAX_OVERLAP);
  const widthInSteps = 1 / (1 - o);
  const step = span / (slots + widthInSteps);
  return { step, width: step * widthInSteps };
}

export type StaggerOptions = {
  /** Where the first item opens, in the parent's travel. */
  from: number;
  /** Where the last item closes. */
  to: number;
  /** How concurrent neighbours are, 0..0.95. See the module comment. */
  overlap?: number;
};

/**
 * `count` windows across `[from, to]`, each overlapping the next.
 *
 * ```tsx
 * const windows = staggerWindows(rows.length, { from: 0.2, to: 0.6 });
 * rows.map((row, i) => <Scrub key={row.id} progress={p} {...windows[i]} ease={EASE.settle} />)
 * ```
 *
 * A `count` of 1 gets the whole span, which is the right answer and is worth
 * stating because the general formula would otherwise divide by zero: one item
 * has no neighbour to be staggered against, so it is simply an arrival.
 */
export function staggerWindows(count: number, options: StaggerOptions): ScrubWindow[] {
  if (count <= 0) return [];

  const { from, to, overlap = 0.6 } = options;
  const { step, width } = solve(count - 1, to - from, overlap);

  return Array.from({ length: count }, (_, i) => ({
    from: from + i * step,
    to: from + i * step + width,
  }));
}

export type GroupStaggerOptions = StaggerOptions & {
  /**
   * The separation between groups, in steps. `1` would place the first item of
   * a group exactly where the next item of the previous group would have gone —
   * no gap at all. The default of 2.5 is what the teardown describes: within a
   * group the items overlap heavily, and between groups there is a clear gap in
   * scroll distance that the reader can feel as a break.
   */
  gap?: number;
};

/**
 * The same, for items that come in groups.
 *
 * `MOTION_TEARDOWN.md` §1 has the hero's mono lists revealing "left group first.
 * Within a group they are close enough to read as one gesture; between groups
 * there is a clear gap in scroll distance." That is two different staggers in
 * one sequence, and writing it by hand means picking six constants and hoping
 * they still add up to the span.
 *
 * ```tsx
 * // Three stages carrying 2, 3 and 2 artifacts.
 * const [ask, workflow, decide] = groupWindows([2, 3, 2], { from: 0.3, to: 0.62 });
 * ```
 *
 * The whole sequence still starts at `from` and ends at `to` however the groups
 * are sized, so a stage gaining a line does not push the last one past the end
 * of the pin.
 */
export function groupWindows(sizes: number[], options: GroupStaggerOptions): ScrubWindow[][] {
  const counts = sizes.filter((n) => n > 0);
  if (counts.length === 0) return sizes.map(() => []);

  const { from, to, overlap = 0.6, gap = 2.5 } = options;

  // Lay the items out on a slot line first: consecutive within a group, `gap`
  // slots from one group's last item to the next group's first. The last slot
  // used is what the span has to cover.
  //
  // The `gap - 1` is the whole of the off-by-one: after a group, `cursor` is
  // already one past its last item, so `gap = 1` means "no gap" — the next group
  // starts exactly where the next consecutive item would have.
  const slotsPerGroup: number[][] = [];
  let cursor = 0;
  counts.forEach((size, g) => {
    if (g > 0) cursor += gap - 1;
    const slots: number[] = [];
    for (let i = 0; i < size; i++) slots.push(cursor++);
    slotsPerGroup.push(slots);
  });

  const last = slotsPerGroup[slotsPerGroup.length - 1];
  const { step, width } = solve(last[last.length - 1], to - from, overlap);

  const windows = slotsPerGroup.map((slots) =>
    slots.map((slot) => ({ from: from + slot * step, to: from + slot * step + width })),
  );

  // Empty groups were filtered out of the arithmetic so they could not consume a
  // gap; put them back as empty arrays so the caller can still index by group.
  let filled = 0;
  return sizes.map((n) => (n > 0 ? windows[filled++] : []));
}

/**
 * Move a set of windows without changing their rhythm.
 *
 * For the case where a group's own arithmetic is right but the whole sequence
 * has to sit later in the parent's travel — a second column that starts after
 * the first has finished, say. Cheaper and much harder to get wrong than
 * recomputing the whole thing against a different span.
 */
export function shiftWindows(windows: ScrubWindow[], by: number): ScrubWindow[] {
  return windows.map((w) => ({ from: w.from + by, to: w.to + by }));
}
