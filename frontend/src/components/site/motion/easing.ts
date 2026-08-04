import { cubicBezier } from "motion/react";

/**
 * The page's curves.
 *
 * `docs/FRAMER_MOTION_NOTES.md` is the research this file is the conclusion of.
 * The short version: almost everything on this page is currently *linear against
 * scroll*, and a linear scrub is the single largest difference between what we
 * have and what the reference feels like. Framer exposes an easing curve on
 * every scroll transform, not just on time-based transitions, and that is most
 * of what "feels Framer" means. Motion supports the same thing — `useTransform`
 * takes an `ease` option — and nobody here was using it.
 *
 * ---
 *
 * **What an easing curve does to a scrubbed window, which is not what it does to
 * a tween.** In a tween the curve reshapes time. In a scrub there is no time:
 * the input is the reader's own scroll position inside the window, so the curve
 * reshapes *distance*. An out-curve therefore means the element does most of its
 * arriving in the first part of the window and spends the rest settling. Read
 * off the curves below, as the fraction of the change completed at each point of
 * the window:
 *
 *     curve                       0.10   0.25   0.50   0.75   0.90
 *     linear (what we ship now)  0.100  0.250  0.500  0.750  0.900
 *     glide   (0.33,1,0.68,1)    0.272  0.578  0.872  0.983  0.999
 *     settle  (0.22,1,0.36,1)    0.401  0.765  0.961  0.997  1.000
 *     arrive  (0.16,1,0.3,1)     0.494  0.825  0.972  0.998  1.000
 *     travel  (0.65,0,0.35,1)    0.009  0.071  0.500  0.929  0.991
 *
 * Two consequences, and the second is the reason this file has a rule in it.
 *
 * The first is that an out-curve makes every existing window *safer*. The
 * failure `useSectionProgress` warns about at length is one-directional: a
 * window that opens late leaves an element sitting on screen invisible, and that
 * costs the reader the content. An out-curve resolves the element earlier in the
 * same window — 87% arrived at the halfway point with `glide` rather than 50% —
 * so every window on the page gains margin against exactly the failure that has
 * bitten this page twice.
 *
 * The second is that the mirror image of that is a trap. `travel` is at 0.071
 * a quarter of the way through its window. **An in-curve on anything that
 * carries opacity reproduces the "invisible while on screen" bug on purpose**,
 * and it does it in a way no probe of the window boundaries would catch, because
 * the window is placed correctly and the element is still not there. So:
 *
 *   - Anything that fades in or out uses an **out** curve. `arrive`, `settle`,
 *     `glide`.
 *   - `travel` — the only in-out curve here — is for a property whose start
 *     value is already legible. A `Cover` panel is opaque for the whole of its
 *     travel; only its position eases. That is the case it is for, and it is the
 *     only one.
 *
 * ---
 *
 * **Why these five and not Motion's own named set.** Motion ships `easeOut` as
 * `cubicBezier(0, 0, 0.58, 1)`, which is the CSS `ease-out` and is very mild —
 * 0.685 at the halfway point, barely distinguishable from linear once it is
 * spread over 400px of scrolling. The curves that read as expensive are the
 * higher-order ones. Each of the four below is the published cubic-bezier
 * approximation of a classic easing family; each was checked numerically against
 * its analytic function across 101 samples, and the largest error in the set is
 * 0.012 (`arrive` against `1 - 2^(-10t)`), which is well under a perceptible
 * step in opacity.
 *
 * They are named for what they are used on rather than for their mathematics,
 * because the mathematics is not the decision a consumer is making.
 */

/** An easing function: window progress in, eased progress out. Both 0..1. */
export type Curve = (progress: number) => number;

/**
 * Identity. Not decoration — `useTransform`'s `ease` option, when given an
 * *array*, falls back to Motion's internal `noop` for any missing entry, and
 * `noop` returns `undefined` rather than its input. A multi-segment range with a
 * short ease array therefore produces `NaN` on the uncovered segments and the
 * element vanishes. Anything building a range of more than two points passes a
 * full-length array, and uses this for the segments it does not want to shape.
 */
export const LINEAR: Curve = (progress) => progress;

export const EASE = {
  /**
   * Expo-out. The strongest front-load in the set: half the change is done in
   * the first tenth of the window.
   *
   * For **surfaces** — a card, a panel, an image arriving as an object. This is
   * the curve that makes `MOTION_TEARDOWN.md` §4's "cards enter with opacity
   * plus a small scale, ~0.96 → 1" read as a card landing rather than as a card
   * being faded up, because the scale is essentially finished while the shadow
   * under it is still coming in.
   *
   * Too strong for a per-word stagger: at 0.494 by a tenth of the window, every
   * word in an overlapping group is effectively arriving at once and the sweep
   * across the line disappears.
   */
  arrive: cubicBezier(0.16, 1, 0.3, 1),

  /**
   * Quint-out. One notch back from `arrive`.
   *
   * For **rows and marks** — a list item, a reason code, a ✓ at the end of a
   * drawn path. Things that arrive as part of a set, where the set reading as a
   * sequence matters more than any one of them landing hard.
   */
  settle: cubicBezier(0.22, 1, 0.36, 1),

  /**
   * Cubic-out. The gentlest front-load worth having.
   *
   * For **text**. A stagger works by the difference between neighbouring units,
   * and a strong curve compresses that difference into the first few percent of
   * every window, which turns a sweep across a line into a flash. `glide` keeps
   * enough of the window in play for the sweep to be legible while still
   * resolving each word well before it is read.
   */
  glide: cubicBezier(0.33, 1, 0.68, 1),

  /**
   * Cubic-in-out. Still at both ends.
   *
   * For a **panel crossing the frame** — `Cover`, and nothing else without an
   * argument. A `Cover` is the one thing on this page that is fully opaque
   * throughout its window, so easing into its start position costs the reader
   * nothing and buys the panel a weight that a linear slide does not have: it
   * gathers off the bottom edge and comes to rest rather than stopping.
   *
   * Read the table again before reaching for this on anything that fades.
   */
  travel: cubicBezier(0.65, 0, 0.35, 1),

  /**
   * No curve. The reader's scroll position, unmodified.
   *
   * The default everywhere it is not overridden, and the *correct* answer for a
   * drawn line. A spine whose job is to be the reader's own progress made
   * visible must not run ahead of their finger and then wait: the whole claim of
   * a scrubbed page is that the user turns the crank, and a curve on the crank
   * itself is the one place that claim stops being literally true.
   */
  linear: LINEAR,
} as const;

/**
 * Springs, in Framer's own units.
 *
 * Framer's transition UI has moved off stiffness/damping/mass onto **time and
 * bounce**, and Motion supports exactly that pair: `visualDuration` is roughly
 * how long the value takes to get where it is going, and `bounce` is 0 for no
 * overshoot through 1 for very bouncy. It is a better interface for the same
 * physics, and it is the one to use for anything new — a reader of
 * `{ visualDuration: 0.18, bounce: 0 }` knows what it will look like, and a
 * reader of `{ stiffness: 220, damping: 40, mass: 0.4 }` has to compute the
 * damping ratio to find out whether it overshoots.
 *
 * (`DrawLine`'s spring predates this and is left alone deliberately: its comment
 * derives ζ ≈ 2.1 by hand and it is not worth churning a primitive two other
 * workstreams are building against to restate the same number. For the record,
 * it is critically damped and would be `{ visualDuration: ~0.19, bounce: 0 }`.)
 *
 * **`bounce` above 0 is forbidden on anything driven by scroll.** A spring
 * following a scrubbed value with bounce overshoots its own target, which on a
 * stroke drawing toward a node reads as the line missing the node and coming
 * back — the exact failure `DrawLine`'s comment describes. `settle` is the only
 * preset here with bounce and it is for a state change, not for a scrub.
 */
export const SPRING = {
  /**
   * Tight. Takes the trackpad jitter out of a scrubbed value without putting a
   * perceptible lag between the reader's fingers and the thing they are moving.
   * The default for `useScrubSpring`.
   */
  follow: { visualDuration: 0.18, bounce: 0 },

  /**
   * Loose. For a large surface, where a little lag reads as mass rather than as
   * latency. Do not put this on anything small or fast; it reads as a dropped
   * frame.
   */
  drift: { visualDuration: 0.45, bounce: 0 },

  /**
   * The one with bounce, and it is not for scroll. A control that has just been
   * pressed, a value that has just changed, a panel that has just opened —
   * anywhere the motion is a response to a discrete event rather than a mapping
   * of a continuous one.
   */
  settle: { visualDuration: 0.4, bounce: 0.18 },
} as const;
