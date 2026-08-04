"use client";

import {
  MotionValue,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { type Curve } from "@/components/site/motion/easing";
import { cn } from "@/lib/utils";

/**
 * The page's scroll vocabulary. Every section builds from these.
 *
 * The distinction that matters: `Reveal` fires once when an element arrives and
 * then it is over. These are *scrubbed* — the user's scroll position drives the
 * animation frame by frame, so it runs forwards and backwards, stalls when they
 * stall, and compresses when they move fast. `docs/MOTION_TEARDOWN.md` records
 * where that came from: the reference pins a section and advances its internal
 * state against scroll rather than playing a timeline at it.
 *
 * All of them collapse to their final state under `prefers-reduced-motion`. Not
 * a shorter animation, no animation: the element paints resolved on the first
 * frame the user ever sees.
 *
 * ---
 *
 * **Why the reduced-motion branch is gated on a layout effect and not on
 * `useReducedMotion()`.** This is the correctness centre of this file and it is
 * worth the paragraphs.
 *
 * `useReducedMotion()` from `motion/react` reads a module-level cache that is
 * `null` on the server (`motion-dom`'s `prefersReducedMotion.current`) and the
 * real boolean on the client, resolved during the first render. So for a reader
 * with the preference set, the server renders one tree and the client's *first*
 * render — the hydration render — renders a different one. That is a hydration
 * mismatch, and the way it fails here is the worst available:
 *
 *   The server emits the animated branch. Every `Scrub` whose window opens above
 *   progress 0 SSRs as `style="opacity:0;transform:translateY(24px)"`, because
 *   `useScroll` starts at 0 and the transform clamps. The client's reduced branch
 *   renders a plain `div` with no style. React does not reconcile attribute
 *   differences during hydration — it matches on element type and text — so the
 *   server's `opacity:0` stays on the node, and nothing re-renders afterwards to
 *   patch it. The result is a landing page that is *entirely invisible* to
 *   exactly the readers who asked for less motion.
 *
 * Three fixes were considered.
 *
 * 1. Render the resolved state on the server for everyone and attach the
 *    animation after mount. Rejected: it inverts the flash. A `Scrub` at scroll 0
 *    is *supposed* to be at zero opacity, so the hero would paint its whole
 *    assembly and then blank it on hydration. Worse for the majority to fix the
 *    minority.
 *
 * 2. A `@media (prefers-reduced-motion: reduce)` block neutralising the inline
 *    styles. This is the textbook answer and it is genuinely better than what is
 *    here, because it also covers the case where JavaScript never arrives. It
 *    needs a rule in `globals.css`, which this workstream does not own; it is
 *    written up in the report instead. The two are complementary, not rival.
 *
 * 3. What is implemented: `useReducedMotionGate()`. Every branch reads `false` on
 *    the server *and* on the first client render, so server and client agree and
 *    there is no mismatch to begin with. A layout effect then reads the media
 *    query and, for a reader with the preference, sets state — and React flushes
 *    that re-render synchronously before the browser paints. The animated tree is
 *    therefore constructed and thrown away inside one commit, and the resolved
 *    tree is the first thing painted.
 *
 * The honest cost of (3), stated because the previous version of this comment
 * claimed something stronger than it delivered: the animated subtree does mount
 * for the duration of that commit, so `useScroll`'s listener and `whileInView`'s
 * observer are attached and torn down within the frame. They never survive to a
 * paint and they never see a scroll event. That is "no animation", but it is not
 * literally "no subscription was ever constructed", and the difference should not
 * be papered over.
 *
 * Every element these primitives write an inline transform to carries
 * `data-scrub` (or `data-scrub-path` for a stroke). Nothing in this file reads
 * it. It exists so that fix (2) is a single block of CSS with a selector already
 * in place rather than a refactor, and so that the one case (3) genuinely cannot
 * reach — a reader whose JavaScript never arrives, who would otherwise get a
 * document of `opacity: 0` — is one rule away from being covered. The rule
 * belongs in `globals.css`, next to the reduced-motion block already there.
 */

/**
 * `useLayoutEffect` warns when React renders on the server, so alias it there.
 * The effect never runs on the server either way — this only silences the
 * warning that would otherwise appear once per primitive per request.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The reader's own answer, when they have given one.
 *
 * `system` follows `prefers-reduced-motion`. `full` animates whatever the system
 * says. `off` stays still whatever the system says.
 *
 * **Why a page may override an accessibility preference at all**, since that is
 * normally the wrong thing to do. On Windows, `prefers-reduced-motion` is driven
 * by Settings > Accessibility > Visual effects > Animation effects, and that one
 * switch is very widely used as a *performance* tweak on modest hardware. So the
 * query conflates two different readers: one who is made unwell by motion, and
 * one who turned off window animations years ago and has no idea it reaches the
 * web. The first must keep a still page; the second is entitled to ask for the
 * animation back.
 *
 * Which is why the default is `system` and nothing here ever changes it on a
 * reader's behalf. There is no prompt, no banner, and no first-visit nudge. A
 * reader who needs stillness never has to defend it; a reader who wants motion
 * has to say so once, and it is remembered.
 */
export type MotionPreference = "system" | "full" | "off";

const MOTION_KEY = "residual.motion.v1";

/** Read the stored preference. Safe on the server and in private browsing. */
export function readMotionPreference(): MotionPreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(MOTION_KEY);
    return stored === "full" || stored === "off" ? stored : "system";
  } catch {
    // Private browsing throws on `localStorage`. The system preference is the
    // right answer when we cannot remember anything.
    return "system";
  }
}

/** Store it, and tell every gate on the page at once. */
export function writeMotionPreference(next: MotionPreference): void {
  try {
    if (next === "system") window.localStorage.removeItem(MOTION_KEY);
    else window.localStorage.setItem(MOTION_KEY, next);
  } catch {
    // Nothing to do. The change still applies for this page view, because the
    // event below fires regardless of whether the write landed.
  }
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/**
 * A same-document change signal. `storage` only fires in *other* tabs, so a
 * control that writes the preference would not update the page it sits on.
 */
export const MOTION_EVENT = "residual:motionpreference";

/**
 * Does this reader want less motion? `false` until the DOM exists.
 *
 * Deliberately *not* `useReducedMotion()` from `motion/react` — see the module
 * comment for why that one is a hydration hazard here rather than in general.
 * The difference only bites when the two branches render different markup, which
 * is exactly what every primitive in this file does.
 *
 * Exported because `reveal.tsx` needs the same gate and because a section that
 * branches at component level (`intro.tsx`, `process.tsx`, `site-header.tsx` all
 * do, which is the right pattern) needs it too. A section using plain
 * `useReducedMotion()` to pick between two different trees has the same bug.
 *
 * **It returns `false` on the server and on the first client render, always**,
 * including when the stored preference is `off`. That looks like a bug and is
 * not: the server cannot read `localStorage`, so any other first value would
 * disagree with the markup it sent and React would throw the whole subtree away.
 * The real value lands in a layout effect, which runs before paint, so nothing
 * is ever visible in the wrong state. This is the same shape `components/gate/`
 * uses for the same reason.
 *
 * It listens for changes rather than reading once, on both the media query and
 * the in-page event, because a reader toggles either *because of* the page they
 * are on.
 */
export function useReducedMotionGate(): boolean {
  const [reduced, setReduced] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const query = window.matchMedia(REDUCED_QUERY);
    const update = () => {
      const preference = readMotionPreference();
      if (preference === "full") setReduced(false);
      else if (preference === "off") setReduced(true);
      else setReduced(query.matches);
    };
    update();
    query.addEventListener("change", update);
    window.addEventListener(MOTION_EVENT, update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener(MOTION_EVENT, update);
    };
  }, []);

  return reduced;
}

/**
 * Where a scrubbed section is in its own travel, 0 to 1.
 *
 * The window is `start end` → `end start`: progress 0 is the section's top
 * arriving at the bottom of the viewport, progress 1 is its bottom leaving the
 * top. The section is "live" exactly while any part of it is on screen.
 *
 * **The arithmetic a consumer needs, because the shape of this offset is not
 * obvious and placing a window badly is how an element ends up sitting on screen
 * at zero opacity.** With viewport height `H` and section height `S`, the total
 * travel is `H + S`, and the section's top sits at `H - p(H + S)` from the top of
 * the viewport. Three consequences:
 *
 *   - `p = 0.5` puts the section's midpoint at the viewport's midpoint, always,
 *     at every viewport and every section height. It is the one fixed point.
 *   - A short section (`S < H`) is fully on screen across `p ∈ [S/(H+S), H/(H+S)]`,
 *     which straddles 0.5 and narrows as the section grows.
 *   - A tall section (`S > H`) fills the viewport across `p ∈ [H/(H+S), S/(H+S)]`.
 *     The taller it is, the more of its progress is spent with the section
 *     mostly off screen, and the more a window placed near 0 or near 1 resolves
 *     somewhere the reader cannot see.
 *
 * The failure that matters is one-directional. A window that closes *early*
 * leaves an element already resolved when it appears, which costs a little
 * movement and nothing else. A window that opens *late* leaves an element
 * invisible while it is on screen, which costs the reader the content. Every
 * consumer on this page was checked against the second case at 1440×900,
 * 1440×760 and 1100×640; the findings are in the report. Prefer to close a
 * window by `S/(H+S)` — around 0.6 for a section a screen and a half tall.
 *
 * ---
 *
 * **How to place a window, rather than guess one.** The rule above says where
 * not to put a window. This says where to put it, and it is the arithmetic every
 * consumer in this directory is now derived from, because the hand-placed
 * constants that preceded it were measured in a browser and found to be spending
 * almost all of their motion off screen.
 *
 * Give the element's top edge and centre as offsets from the top of the track,
 * `top` and `centre`. Then the element's centre sits at viewport fraction
 *
 *     f(p) = 1 + centre/H − p(H+S)/H
 *
 * which rearranges to the only two expressions a consumer needs:
 *
 *     from = top / (H + S)              its top edge reaching the fold
 *     to   = (top + W) / (H + S)        W pixels of scrolling later
 *
 * The first is exact and free: an element's window should open on the frame it
 * first becomes visible, which is simply its own offset over the travel. The
 * second says something that is not obvious and is the reason this is written
 * down — **`W` is a distance in pixels, and a window's duration does not depend
 * on the height of the section it is in.** Two lists in sections of very
 * different heights, given the same `W`, animate for the same length of time.
 * A window expressed as "0.24 of the travel" does not: in a tall section that is
 * a long, slow arrival and in a short one it is a flicker, which is exactly how
 * this page ended up with windows ranging from 100px to 600px of scroll with no
 * one having chosen either number.
 *
 * The budgets in use, both of them a fraction of the *viewport* rather than of
 * the section:
 *
 *     surfaces   W = 0.60 H   a card, arriving as an object
 *     rows       W = 0.52 H + h/2, which is the same as closing when the
 *                element's centre reaches 48% of the screen
 *
 * At the 720px viewport that most readers actually have, both land near 400px of
 * scrolling. The ceiling worth knowing about: an element that opens as its top
 * appears and closes as its centre passes the middle can spend at most
 * `0.5 H + h/2` — about 580px for a tall card. Beyond that it is still arriving
 * while it is being read. A pinned section is the only way past that ceiling,
 * which is why the hero and the intro paragraph are pinned and nothing else is.
 *
 * Under reduced motion this returns a `MotionValue` fixed at 1, so a section that
 * does *not* branch at component level still renders every window resolved rather
 * than at its start value. `useScroll` is still called — it has to be, a hook
 * cannot be conditional and the gate flips after mount — so the listener exists
 * and is simply not read. A section that wants the subscription gone as well has
 * to branch at component level the way `process.tsx` does.
 */
export function useSectionProgress(ref: React.RefObject<HTMLElement | null>) {
  const reduced = useReducedMotionGate();
  const resolved = useMotionValue(1);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  return reduced ? resolved : scrollYProgress;
}

/**
 * A section that holds still while its contents advance.
 *
 * `height` is the scroll distance the reader spends inside it. 300vh means the
 * pin lasts three screens of scrolling. The sticky child is exactly one viewport,
 * so nothing inside can be taller than the screen without becoming unreachable —
 * that is the one failure mode worth watching for, and it is why a consumer
 * should degrade to a static section on short viewports rather than pin anyway.
 * In development the frame measures itself and says so in the console when its
 * contents overflow; see `useOverflowWarning`.
 *
 * The optional props exist so this can be the only sticky-track implementation on
 * the page. `intro.tsx` currently hand-rolls the same mechanic — a tall track
 * with a `sticky top-0 h-[100dvh]` child — and two implementations of one
 * mechanic is the failure `CLAUDE.md` describes with the two `latexutil.py`
 * modules: nothing imports both, so no file read reveals the duplication. The
 * four props below are exactly what that consumer needs and nothing more.
 *
 *   `as`          the track element. `intro.tsx` sits inside an existing
 *                 `<section id="intro">`, and nesting a second sectioning element
 *                 there adds a rung to the document outline for a scroll trick.
 *   `frameClass`  classes on the sticky frame. `intro` centres its paragraph;
 *                 `hero` lays out its own contents and wants nothing.
 *   `clip`        whether the frame clips. See below.
 *   `restClass`   classes on the reduced-motion frame, which is a different box:
 *                 it holds resolved contents at their natural height and has no
 *                 business being a screen tall unless the consumer says so.
 *
 * **On clipping.** The frame clips with `overflow-clip`, not `overflow-hidden`,
 * and the two are not interchangeable here. `overflow: hidden` makes the element
 * a scroll container, which has two consequences this page cannot afford: a
 * `position: sticky` descendant would resolve against a box that never scrolls,
 * which is to say it would not stick; and moving focus to a control that the pin
 * has translated out of view makes the browser scroll the container to reach it,
 * permanently offsetting the pinned contents with no scrollbar to put them back.
 * The hero's call to action spends most of the pin exactly there. `overflow: clip`
 * paints identically and creates no scroll container, so neither happens. It is
 * also why `clip` is a prop rather than always on: `intro.tsx`'s comment about
 * refusing to clip is about an *ancestor*, but the distinction is subtle enough
 * that the consumer should be able to say no.
 */
export function Pin({
  children,
  height = "300vh",
  className,
  as = "section",
  frameClass,
  clip = true,
  restClass = "min-h-[100dvh]",
}: {
  children: (progress: MotionValue<number>) => ReactNode;
  height?: string;
  className?: string;
  as?: "section" | "div";
  frameClass?: string;
  clip?: boolean;
  restClass?: string;
}) {
  const reduced = useReducedMotionGate();

  if (reduced) {
    return <RestingFrame as={as} className={className} restClass={restClass} render={children} />;
  }

  return (
    <PinnedTrack
      as={as}
      height={height}
      className={className}
      frameClass={frameClass}
      clip={clip}
      render={children}
    />
  );
}

/**
 * The pin at rest.
 *
 * A separate component rather than an early return inside `Pin`, and the reason
 * is not style: `useScroll({ target })` on a ref that is never attached to a node
 * does not quietly track nothing. It defers, finds the ref still null, and in
 * development trips `invariant("Target ref is defined but not hydrated")`. That
 * throw happens inside Motion's microtask batcher, which sets `isProcessing` on
 * the way in and clears it on the way out — so a throw leaves the flag set, the
 * batcher never schedules again, and every deferred piece of Motion work on the
 * page stops. One reduced-motion pin took the whole page's scroll machinery down
 * with it. Not mounting the hook is the fix; guarding the ref would not be,
 * because the hook still has to be called unconditionally wherever it lives.
 *
 * The resolved progress is `useMotionValue(1)`, not a freshly constructed
 * `MotionValue`. Constructing one during render is legal in Motion 12 —
 * `MotionValue` is a real runtime export, so the previous `new MotionValue(1)`
 * did not throw — but it hands a new object identity to the children on every
 * render, and anything that derived from it resubscribed each time. `1` is what a
 * consumer's windows should all resolve against: fully travelled, everything
 * arrived, nothing pending.
 */
function RestingFrame({
  render,
  className,
  as,
  restClass,
}: {
  render: (progress: MotionValue<number>) => ReactNode;
  className?: string;
  as: "section" | "div";
  restClass?: string;
}) {
  const resolved = useMotionValue(1);
  const frame = <div className={restClass}>{render(resolved)}</div>;

  if (as === "div") return <div className={className}>{frame}</div>;
  return <section className={className}>{frame}</section>;
}

/** The pin doing its job: a tall track with a one-viewport frame stuck to the top of it. */
function PinnedTrack({
  render,
  height,
  className,
  as,
  frameClass,
  clip,
}: {
  render: (progress: MotionValue<number>) => ReactNode;
  height: string;
  className?: string;
  as: "section" | "div";
  frameClass?: string;
  clip: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const frameRef = useOverflowWarning();

  const frame = (
    <div
      ref={frameRef}
      className={["sticky top-0 h-[100dvh]", clip ? "overflow-clip" : undefined, frameClass]
        .filter(Boolean)
        .join(" ")}
    >
      {render(scrollYProgress)}
    </div>
  );

  if (as === "div") {
    return (
      <div ref={ref} style={{ height }} className={className}>
        {frame}
      </div>
    );
  }
  return (
    <section ref={ref} style={{ height }} className={className}>
      {frame}
    </section>
  );
}

/**
 * Development-only: shout when a pinned frame is shorter than its own contents.
 *
 * This is the recurring failure of the whole page and it is silent by
 * construction — the frame clips, so the missing half looks like a design
 * decision rather than a bug, and it only appears at viewport heights the person
 * building it does not happen to be using. Several sections carry comments
 * explaining that they refused to pin for this reason; those comments are
 * arithmetic done by hand, which is the sort of thing that goes stale. This
 * measures the real boxes at the real viewport instead.
 *
 * It measures the bottom of the frame's furthest descendant against the bottom of
 * the frame rather than reading `scrollHeight`, because `overflow: clip` does not
 * make a scroll container and so does not give `scrollHeight` anything to report.
 * Stripped entirely from a production build.
 */
function useOverflowWarning() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const el = ref.current;
    if (!el) return;

    let warned = false;
    const measure = () => {
      const frame = el.getBoundingClientRect();
      let lowest = frame.bottom;
      for (const child of Array.from(el.children)) {
        lowest = Math.max(lowest, child.getBoundingClientRect().bottom);
      }
      const overflow = Math.round(lowest - frame.bottom);
      if (overflow > 1 && !warned) {
        warned = true;
        console.warn(
          `[Pin] The pinned frame is ${overflow}px shorter than its contents at ` +
            `${window.innerWidth}x${window.innerHeight}. Everything below the fold of a ` +
            `pinned frame is unreachable — the frame does not scroll. Either shrink the ` +
            `contents or gate the pin on a taller viewport.`,
        );
      }
      if (overflow <= 1) warned = false;
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return ref;
}

/**
 * Map a slice of a section's progress onto one element.
 *
 * `from` and `to` are positions in the parent's 0..1 travel, so a stagger is
 * expressed as overlapping windows rather than as delays in milliseconds. That
 * is what makes a fast scroll compress the sequence instead of queueing it.
 *
 * Pointer events follow opacity, which they did not before. An element at zero
 * opacity still takes a click and there is a lot of this page underneath other
 * parts of it while it waits its turn — the hero's call to action spends most of
 * the pin invisible and directly beneath the headline, and `hero.tsx` had to
 * invent a wrapper of its own to stop the top of the page having a dead link
 * across it. That belongs here, where every consumer gets it.
 *
 * What was decided against: also setting `visibility: hidden` at zero opacity, so
 * that a waiting element leaves the tab order. It would work, and it would also
 * take the element out of the accessibility tree — and on this page almost all
 * the prose lives inside a `Scrub`, so a screen reader would find the document
 * progressively empty. Zero-opacity content is still read, which is the correct
 * trade. The tab-order case turns out to look after itself: moving focus to an
 * off-screen control scrolls it into view, and scrolling it into view is what
 * lights it up.
 *
 * ---
 *
 * **`lift` — the card gaining its shadow as it arrives.** A surface that fades
 * and scales still reads as a picture of a card being faded in. A surface that
 * also acquires its elevation reads as one arriving, and depth is the one thing
 * this page's vocabulary already had tokens for and was not animating at all.
 *
 * It is a layer rather than an animated `box-shadow`: an absolutely positioned
 * sibling behind the children, carrying one of the existing elevation tokens,
 * whose *opacity* is scrubbed. Three reasons it is built that way. A
 * `box-shadow` cannot be interpolated from a CSS variable, so animating the
 * property would mean copying the six shadow stops out of `globals.css` into
 * this file, where they would drift. Opacity is composited and a multi-stop
 * shadow repaint is not. And the layer inherits the parent's own fade, so the
 * effective shadow is the square of the progress — the surface reaches full
 * opacity while its shadow is still coming in, which is what makes it read as
 * settling onto the page rather than as a picture that includes a shadow.
 *
 * The consumer must set `elevation="none"` on the `Card` inside it. Two shadows
 * on one surface is the "reads as fog" failure `ui.tsx` describes, and the
 * inline `box-shadow` a `Card` writes cannot be overridden from out here.
 *
 * Under reduced motion the layer is still rendered, at rest and at full
 * strength. A reader who asked for less motion should get the resolved card,
 * and the resolved card has a shadow; dropping the layer with the animation
 * would quietly flatten every surface on the page for exactly those readers.
 *
 * ---
 *
 * **`ease` — the shape of the window, added late and defaulted to nothing.**
 * Every window in this file was linear against scroll until `motion/easing.ts`
 * was written, and `docs/FRAMER_MOTION_NOTES.md` argues that a curve on a scroll
 * transform is most of the difference between this page and the reference. It is
 * optional and undefined by default, which Motion's interpolator treats as
 * exactly identical to the old behaviour — so no existing call site changes
 * until somebody sets it deliberately.
 *
 * What to set it to: `EASE.arrive` for a surface, `EASE.settle` for a row,
 * `EASE.glide` for text. Not an in-curve, ever, on a window that carries
 * opacity — `motion/easing.ts` has the table showing why that reproduces the
 * "invisible while on screen" failure on purpose.
 *
 * The same curve shapes opacity, `y`, `scale` and `blur` together. Giving them
 * separate curves was considered and refused: the whole claim of a card arriving
 * as an object is that its properties are one gesture, and four curves is four
 * gestures that happen to start at the same time.
 */
export function Scrub({
  progress,
  from,
  to,
  y = 24,
  scale,
  blur,
  lift,
  liftRadius = "card",
  ease,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  y?: number;
  scale?: [number, number];
  blur?: number;
  lift?: "raised" | "card";
  liftRadius?: "card" | "inner";
  /** The curve the window is read through. Undefined is linear, as before. */
  ease?: Curve;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotionGate();

  if (reduced) {
    if (!lift) return <div className={className}>{children}</div>;
    return (
      <div className={cn("relative", className)}>
        <span
          aria-hidden="true"
          data-scrub=""
          className="pointer-events-none absolute inset-0"
          style={{ borderRadius: LIFT_RADIUS[liftRadius], boxShadow: LIFT_SHADOW[lift] }}
        />
        {children}
      </div>
    );
  }

  return (
    <ScrubbedBox
      progress={progress}
      from={from}
      to={to}
      y={y}
      scale={scale}
      blur={blur}
      lift={lift}
      liftRadius={liftRadius}
      ease={ease}
      className={className}
    >
      {children}
    </ScrubbedBox>
  );
}

/** The elevation tokens `lift` is allowed to reach for. Not free-form shadows. */
const LIFT_SHADOW = {
  raised: "var(--site-shadow-raised)",
  card: "var(--site-shadow-card)",
} as const;

/** Matching the two radius tokens, because the layer has to be the card's shape. */
const LIFT_RADIUS = {
  card: "var(--site-radius-card)",
  inner: "var(--site-radius-inner)",
} as const;

function ScrubbedBox({
  progress,
  from,
  to,
  y,
  scale,
  blur,
  lift,
  liftRadius,
  ease,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  y: number;
  scale?: [number, number];
  blur?: number;
  lift?: "raised" | "card";
  liftRadius: "card" | "inner";
  ease?: Curve;
  children: ReactNode;
  className?: string;
}) {
  const opacity = useTransform(progress, [from, to], [0, 1], { clamp: true, ease });
  const ty = useTransform(progress, [from, to], [y, 0], { clamp: true, ease });
  const s = useTransform(progress, [from, to], scale ?? [1, 1], { clamp: true, ease });
  const f = useTransform(progress, [from, to], [blur ?? 0, 0], { clamp: true, ease });
  const filter = useTransform(f, (v) => (v > 0.01 ? `blur(${v}px)` : "none"));
  const pointerEvents = useTransform(opacity, (v) => (v > 0 ? "auto" : "none"));

  return (
    <motion.div
      data-scrub=""
      className={lift ? cn("relative", className) : className}
      style={{ opacity, y: ty, scale: s, filter, pointerEvents }}
    >
      {/* Behind the children and inside the scale, so the shadow arrives with
          the surface and grows with it. It reads the same `opacity` the box
          already carries, which the parent then multiplies by again — the lag
          that turns a fade into an arrival. */}
      {lift && (
        <motion.span
          aria-hidden="true"
          data-scrub=""
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: LIFT_RADIUS[liftRadius],
            boxShadow: LIFT_SHADOW[lift],
            opacity,
          }}
        />
      )}
      {children}
    </motion.div>
  );
}

/**
 * A line that draws itself as the section advances.
 *
 * Wraps an SVG path in a `pathLength` transform, which is how the reference's
 * spine works. Spring-smoothed because a raw scroll value on a stroke reads as
 * jitter on a trackpad. The spring is overdamped on purpose — at stiffness 220,
 * damping 40 and mass 0.4 the damping ratio is about 2.1, so the stroke cannot
 * overshoot past its own end and snap back, which on a line that is drawing to a
 * node would read as the line missing.
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
  const reduced = useReducedMotionGate();

  // A plain path, not a `motion.path` pinned at `pathLength: 1`. The drawn state
  // and the undrawn state of an SVG stroke differ by a dash array, and the
  // resolved state of this element is simply a line — no spring is constructed,
  // no frame loop starts, and nothing writes to the node after the first paint.
  if (reduced) {
    return <path d={d} className={className} strokeWidth={strokeWidth} fill="none" />;
  }

  return (
    <DrawnPath
      progress={progress}
      from={from}
      to={to}
      d={d}
      className={className}
      strokeWidth={strokeWidth}
    />
  );
}

function DrawnPath({
  progress,
  from,
  to,
  d,
  className,
  strokeWidth,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  d: string;
  className?: string;
  strokeWidth: number;
}) {
  const raw = useTransform(progress, [from, to], [0, 1], { clamp: true });
  const pathLength = useSpring(raw, { stiffness: 220, damping: 40, mass: 0.4 });

  return (
    <motion.path
      data-scrub-path=""
      d={d}
      className={className}
      strokeWidth={strokeWidth}
      fill="none"
      style={{ pathLength }}
    />
  );
}

/**
 * A panel that slides up over whatever is behind it, driven by scroll.
 *
 * `MOTION_TEARDOWN.md` §3 is the one moment the reference builds its page
 * around, and it is specific about the mechanic: two panels of identical
 * geometry, and the second **translates up and covers the first**. Not a
 * crossfade, not a colour morph, not a scale. The teardown says so twice, so
 * this deliberately animates one property and refuses to fade — a panel that
 * arrives at 60% opacity is two panels visible at once, which is the one reading
 * the device exists to prevent.
 *
 * It travels in percentages of its own height rather than pixels, so it covers
 * exactly whatever it is sized to and needs no measurement. The caller positions
 * it — usually `absolute inset-0` over the panel being covered — and owns the
 * stacking order.
 *
 * §4 of the same document records that the reference does not rotate and does not
 * parallax, and nothing here does either: this is a single-axis translate of one
 * element to a resting position it holds, which is the opposite of a parallax
 * layer that never arrives anywhere.
 *
 * Under reduced motion the covering panel renders already in place. The resolved
 * state of "B covers A" is B, and a reader who asked for less motion should get
 * the resolution rather than the setup.
 */
export function Cover({
  progress,
  from,
  to,
  ease,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  /**
   * Optional, and this is the one place on the page an **in-out** curve is the
   * right answer. `EASE.travel` is still at both ends, so the panel gathers off
   * the bottom edge and comes to rest rather than starting and stopping at a
   * constant rate. The rule in `motion/easing.ts` against in-curves is about
   * windows that carry opacity, and this one carries none: the panel is fully
   * opaque for the whole of its travel, so easing into its start position cannot
   * leave the reader looking at something they cannot see.
   *
   * Undefined by default, which is linear, which is what shipped.
   */
  ease?: Curve;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotionGate();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <CoveringPanel progress={progress} from={from} to={to} ease={ease} className={className}>
      {children}
    </CoveringPanel>
  );
}

function CoveringPanel({
  progress,
  from,
  to,
  ease,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  ease?: Curve;
  children: ReactNode;
  className?: string;
}) {
  const y = useTransform(progress, [from, to], ["100%", "0%"], { clamp: true, ease });

  // No spring. A stroke needs smoothing because `stroke-dashoffset` is not
  // composited and a raw trackpad value reads as jitter on it; a transform is,
  // and a spring on a panel this size would add a lag between the reader's
  // fingers and the thing they are moving.
  return (
    <motion.div data-scrub="" className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
