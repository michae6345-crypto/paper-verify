"use client";

import { MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { DrawLine, Scrub, useSectionProgress } from "@/components/site/motion/scrub";
import { cn } from "@/lib/utils";

/**
 * The phone's scroll vocabulary.
 *
 * `motion/scrub.tsx` is the page's vocabulary and this does not replace it —
 * every primitive here is built out of `Scrub`, `DrawLine` and
 * `useSectionProgress`. What it adds is the part that turns out not to survive
 * the trip to a 390px screen.
 *
 * ---
 *
 * **The measurement this file exists because of.** `scripts/probe-motion.mjs`
 * walks every `[data-scrub]` on the page, scrolls each one to the frame its own
 * centre first crosses the fold, and reads its opacity there. At 1536 x 720 the
 * page is in good shape, which is what the constants in each section were tuned
 * against. At **390 x 844, thirty of seventy-nine elements were misplaced and
 * twenty-three of those were at opacity 0** — still completely invisible on the
 * frame they arrived on. All four reason codes in `decides`, all four roadmap
 * items, all four rows of the report card, three of the five process cards, and
 * three of the four verdict pills.
 *
 * The cause is one thing, and it is the thing `useSectionProgress`'s doc comment
 * warns about in the abstract: **a window expressed as a fraction of a section
 * is a different number of pixels in a different layout.** `decides` is 1021px
 * tall at 1100px wide and about 1900 on a phone, because the card and the
 * paragraph stop being two columns and become two rows. `REASON_START = 0.309`
 * is 538px of scrolling in the first case and 850 in the second, but the element
 * it belongs to did not move down by 312px — it moved by rather less. So the
 * window opens long after the element is on screen, and the reader scrolls past
 * four invisible lines.
 *
 * Tuning those constants for a phone would break the desktop, because there is
 * no single fraction that is both. The fix has to remove the dependency instead.
 *
 * **So on a narrow viewport every element is measured against itself.** Give an
 * element its own track — `useSectionProgress` on the element rather than on its
 * section — and two things become true at every viewport and every element
 * height, with no constant to go stale:
 *
 *   - progress 0 is the frame its own top edge reaches the fold, exactly.
 *   - progress 0.5 is its centre at the centre of the screen, exactly. That is
 *     the fixed point `useSectionProgress` names, and it is the only position in
 *     the travel that does not move with `H` or `S`.
 *
 * An element therefore opens as it appears and closes somewhere before it is
 * centred, by construction rather than by arithmetic. The stagger between
 * siblings comes back for free and in the right units: they arrive at different
 * scroll positions because they are at different heights on the page, which is
 * `MOTION_TEARDOWN.md` §4's "stagger measured in scroll distance" stated as a
 * geometric fact instead of as a set of offsets.
 *
 * **The window is still a distance in pixels**, which is the other half of the
 * rule. `useTravel` measures `H + S` for the element, and the budget is turned
 * into a fraction of that at runtime: 0.55 of the viewport for a surface, 0.45
 * plus half the element for a row, which at 844 is 464px and 380 + h/2. Those
 * are the budgets `motion/scrub.tsx` records, evaluated against the phone's own
 * viewport rather than against the desktop's.
 *
 * The cost is one scroll subscription per element instead of one per section.
 * That is the price of the guarantee, it is only paid below the breakpoint, and
 * it buys the property that no window on this page can be wrong at a viewport
 * nobody tested.
 */

/** `useLayoutEffect` warns on the server. Same alias, same reason, as `scrub.tsx`. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Is the viewport at least this wide? `false` until the DOM has been read.
 *
 * The same shape as `useReducedMotionGate`, and for the same reason: every
 * caller uses it to pick between two structurally different trees, so the value
 * has to agree with the server on the first client render and change in a layout
 * effect, before paint. `usePinnable` in `hero.tsx` and `useRowLayout` in
 * `process.tsx` are both this hook written out by hand.
 *
 * It starts `false`, which means **the phone's tree is the one the server
 * renders** and a wide viewport upgrades away from it after hydration. That is
 * the right way round for two reasons. It is mobile-first, so the markup a phone
 * receives is the markup it keeps. And the narrow branch is the cheaper of the
 * two everywhere it differs — no pin, no horizontal spine — so the frame that
 * gets thrown away is the small one.
 */
export function useWideLayout(minWidth: number): boolean {
  const [wide, setWide] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const query = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [minWidth]);

  return wide;
}

/** The breakpoint the site's layout already turns on. Named so it is not retyped. */
export const WIDE = 1100;

/**
 * `H + S` for one element: the total scroll distance its own track spans.
 *
 * This is the denominator in `useSectionProgress`'s arithmetic, and measuring it
 * is what lets a window be stated in pixels. `0` until the element exists, and a
 * caller must treat that as "no measurement yet" rather than as a height.
 *
 * It watches the element and the viewport, because both terms move: a phone's
 * `innerHeight` changes when the address bar retracts, and an element's height
 * changes when a `<details>` opens above it.
 */
function useTravel(ref: RefObject<HTMLElement | null>): number {
  const [travel, setTravel] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setTravel(window.innerHeight + el.offsetHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);

  return travel;
}

/**
 * The scroll budget an element gets, as a fraction of its own travel.
 *
 * `motion/scrub.tsx` records the two budgets this page uses and both are a
 * fraction of the *viewport*: 0.60 H for a surface arriving as an object, and
 * 0.52 H + h/2 for a row, which is the same as closing when the row's centre
 * reaches 48% of the screen. They are slightly shorter here — 0.55 and 0.45 —
 * because a phone's viewport is taller relative to its content and a reader
 * moving a page with a thumb covers ground faster than one moving it with a
 * wheel.
 *
 * The ceiling is the point. An element whose window is still open past 0.55 of
 * its travel is still arriving after its centre has passed the middle of the
 * screen, which is to say it is still arriving while it is being read. The floor
 * stops a very tall element — a card most of a screen high — from getting a
 * window so short it reads as a cut.
 */
const CEILING = 0.55;
const FLOOR = 0.12;

function budgetWindow(travel: number, kind: "surface" | "row", lead: number): [number, number] {
  if (travel <= 0) return [lead, lead + CEILING];

  // `travel` is H + S, so S is whatever is left after the viewport. Recovering it
  // here rather than measuring it separately keeps the two in step.
  const viewport = typeof window === "undefined" ? 0 : window.innerHeight;
  const height = Math.max(0, travel - viewport);
  const px = kind === "surface" ? viewport * 0.55 : viewport * 0.45 + height / 2;
  const span = Math.min(CEILING, Math.max(FLOOR, px / travel));
  return [lead, lead + span];
}

/**
 * One element's own track and the window on it, for a caller that needs to hang
 * more than one thing off the same measurement.
 *
 * `Rise` covers the common case — an element that arrives — in one component.
 * This is for the case where an element arrives *and* something inside it has to
 * follow: the measured band's figures roll into place once the row carrying them
 * has established itself, and the roll has to be placed against the row's travel
 * rather than against a second subscription of its own, or the two drift apart
 * on a viewport neither was measured at.
 *
 * The caller attaches `ref` to the box it wants measured, and gets back the
 * progress of that box plus the window a `Rise` would have used.
 */
export function useOwnTrack(
  ref: RefObject<HTMLElement | null>,
  kind: "surface" | "row" = "row",
  lead = 0,
): { progress: MotionValue<number>; from: number; to: number } {
  const progress = useSectionProgress(ref);
  const travel = useTravel(ref);
  const [from, to] = budgetWindow(travel, kind, lead);
  return { progress, from, to };
}

/**
 * A scrubbed arrival that measures itself when the layout is narrow.
 *
 * A drop-in for `Scrub` at every call site that currently maps a slice of a
 * *section's* travel: it takes the same `progress`, `from` and `to`, uses them
 * unchanged above `WIDE`, and below it ignores them in favour of the element's
 * own track. The desktop numbers are left exactly as they were — they were
 * measured in a browser at the viewports the comments name, and they are right
 * there.
 *
 * Two components rather than one branch, for the reason `RestingFrame` gives in
 * `scrub.tsx`: hooks cannot be conditional, so the only way for the wide branch
 * not to open a second scroll subscription is for it to be a different
 * component. Both render the same two nested elements, so the swap after
 * hydration reconciles rather than replacing.
 *
 * `className` goes on the outer box, not on the animated one. That box is what
 * the narrow branch measures, and an element that measured itself while being
 * translated would feed its own animation back into its window.
 */
export type ArriveProps = {
  progress: MotionValue<number>;
  from: number;
  to: number;
  /** Where in its own travel the narrow branch opens. A stagger inside one row. */
  lead?: number;
  /** Which budget applies. A card is a surface; a line of text is a row. */
  kind?: "surface" | "row";
  y?: number;
  scale?: [number, number];
  blur?: number;
  lift?: "raised" | "card";
  liftRadius?: "card" | "inner";
  /**
   * On the animated box — exactly where `Scrub` puts it, so a call site that
   * swaps `Scrub` for `Arrive` keeps the meaning of every class it already has.
   *
   * That matters more than it sounds. Several call sites use this to lay out
   * their *own children* (`report.tsx`'s rows are `two:flex-row` so a term and
   * its definition sit side by side), and moving it to a wrapper silently made
   * the flex container an element with one child in it. Nothing errors; the
   * layout just quietly stops happening above 760px.
   */
  className?: string;
  /**
   * On the measured box outside it, for the case where the *wrapper* has to
   * participate in a parent's layout — a card that is `three:flex-1` in a flex
   * row, or one that has a fixed column width. Those cannot go on the animated
   * box, because the animated box is not the parent's child.
   */
  boxClassName?: string;
  children: ReactNode;
};

export function Arrive(props: ArriveProps) {
  const wide = useWideLayout(WIDE);
  return wide ? <SectionArrive {...props} /> : <SelfArrive {...props} />;
}

/** Above the breakpoint: the section's travel and the constants tuned against it. */
function SectionArrive({
  progress,
  from,
  to,
  y = 14,
  scale,
  blur,
  lift,
  liftRadius,
  className,
  boxClassName,
  children,
}: ArriveProps) {
  return (
    <div className={boxClassName}>
      <Scrub
        progress={progress}
        from={from}
        to={to}
        y={y}
        scale={scale}
        blur={blur}
        lift={lift}
        liftRadius={liftRadius}
        className={className}
      >
        {children}
      </Scrub>
    </div>
  );
}

/** Below it: its own travel, and a budget in pixels of the viewport it is on. */
function SelfArrive({
  lead = 0,
  kind = "row",
  y = 14,
  scale,
  blur,
  lift,
  liftRadius,
  className,
  boxClassName,
  children,
}: ArriveProps) {
  return (
    <Rise
      lead={lead}
      kind={kind}
      y={y}
      scale={scale}
      blur={blur}
      lift={lift}
      liftRadius={liftRadius}
      className={className}
      boxClassName={boxClassName}
    >
      {children}
    </Rise>
  );
}

/**
 * The arrival that measures itself, for markup that only exists on a phone and
 * so has no section constant to fall back to.
 *
 * This is `SelfArrive`'s body; `Arrive` is the pair of them with a gate in
 * front. Everything the narrow branch of this page animates comes through here.
 */
export function Rise({
  lead = 0,
  kind = "row",
  y = 14,
  scale,
  blur,
  lift,
  liftRadius,
  className,
  boxClassName,
  children,
}: Omit<ArriveProps, "progress" | "from" | "to">) {
  const box = useRef<HTMLDivElement>(null);
  const own = useSectionProgress(box);
  const travel = useTravel(box);
  const [from, to] = budgetWindow(travel, kind, lead);

  return (
    <div ref={box} className={boxClassName}>
      <Scrub
        progress={own}
        from={from}
        to={to}
        y={y}
        scale={scale}
        blur={blur}
        lift={lift}
        liftRadius={liftRadius}
        className={className}
      >
        {children}
      </Scrub>
    </div>
  );
}

/**
 * A track whose own progress is remapped onto somebody else's 0..1 score.
 *
 * The apparatus has a scroll score — read marks, then the cover, then
 * forty-five verdict marks, then the tally — written as constants in the pin's
 * travel. On a phone there is no pin, but the score is still the right score, so
 * rather than write a second one this stretches the section's own travel over
 * the part of it where the panels are actually on screen and hands the same
 * numbers back.
 *
 * `from` and `to` are where in the element's travel the score should start and
 * finish. They are not a budget in pixels because this one genuinely is a
 * fraction of an element: the whole point is that the sequence runs while that
 * element is in front of the reader, and "in front of the reader" is a fraction
 * of its travel by definition.
 */
export function useScoreTrack(
  ref: RefObject<HTMLElement | null>,
  from: number,
  to: number,
): MotionValue<number> {
  const progress = useSectionProgress(ref);
  return useTransform(progress, [from, to], [0, 1], { clamp: true });
}

/* ---------------------------------------------------------------------------
   The spine, turned on its side.
   --------------------------------------------------------------------------- */

/**
 * One segment of a vertical spine: a hairline that draws downward past a node.
 *
 * The page's spine is horizontal in two places and it cannot be on a phone — five
 * stage labels across 390px collide, which is what the width term in
 * `hero.tsx`'s pin gate is actually about. Turned vertical it stops competing
 * for width and starts agreeing with the direction the reader is already
 * moving, which is the one thing a horizontal spine on a phone can never do.
 *
 * The line is per row rather than one path down the whole list, and that is what
 * makes the node lighting exact without measuring anything: a row's node sits at
 * the top of its own segment, so "the line has reached this node" and "this
 * segment has started drawing" are the same event. A single path down the list
 * would need each node's offset within it, which is a measurement that goes
 * stale the moment a description wraps to another line.
 *
 * `DrawLine` rather than a `scaleY`, because the drawn stroke is the page's
 * existing vocabulary and it already collapses correctly under reduced motion —
 * it renders a plain `path` with no spring and no frame loop. The viewBox is two
 * units wide and a hundred tall with `preserveAspectRatio="none"`, so the
 * segment stretches to whatever height its row turns out to be and the stroke
 * width does not stretch with it.
 */
function SpineSegment({
  progress,
  from,
  to,
  last,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  /** The last node draws no line below it. A spine that runs on ends nowhere. */
  last: boolean;
}) {
  return (
    <div className="relative flex w-3 shrink-0 justify-center" aria-hidden="true">
      {!last && (
        <>
          <div
            className="absolute top-1 bottom-0 w-px"
            style={{ background: "var(--site-line)" }}
          />
          <svg
            className="absolute top-1 bottom-0 w-0.5"
            viewBox="0 0 2 100"
            preserveAspectRatio="none"
          >
            <g stroke="var(--site-ink)">
              <DrawLine progress={progress} from={from} to={to} d="M1 0 V100" strokeWidth={1} />
            </g>
          </svg>
        </>
      )}

      <div className="relative mt-0.5 h-2 w-2">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: "var(--site-line-strong)" }}
        />
        <Scrub
          progress={progress}
          from={from}
          to={from + NODE_SPAN}
          y={0}
          className="absolute inset-0"
        >
          <div className="h-2 w-2 rounded-full" style={{ background: "var(--site-ink)" }} />
        </Scrub>
      </div>
    </div>
  );
}

/**
 * A list whose spine draws down it as it crosses the screen.
 *
 * **The windows are derived from the list's measured geometry, and the first
 * version of this was not.** It spread the draw evenly from 0.08 to 0.62 of the
 * list's travel and gave each row an equal share, which is the same mistake this
 * whole file exists to correct, one level down: an even spread over a track says
 * nothing about where on the *screen* any given row is when its share comes up.
 * Measured at 390 x 844 the hero's last stage was at **opacity 0.37 with its
 * centre in the middle of the screen** — the reader watched `adjudicating`
 * finish arriving after they had already read it.
 *
 * What replaces it is the arithmetic in `useSectionProgress`'s doc comment,
 * applied to a row rather than to a section. A row whose centre sits `off`
 * pixels down a list of height `S`, in a viewport of height `H`, has its centre
 * at the middle of the screen when the list's progress is
 *
 *     p = (H/2 + off) / (H + S)
 *
 * and that is the moment the row is being read. So every window is placed
 * against its own `p`: the line reaches node `i` a fixed `LEAD` of travel before
 * it, the row resolves just after it, and the segment between two nodes draws
 * across exactly the gap between their two arrivals. All three then agree by
 * construction at any viewport and any list height, which is what the even
 * spread could only do at one.
 *
 * `off` assumes the rows are of a piece — `(i + 0.5) / count` of the list. They
 * are not exactly, since a two-line description makes a taller card than a
 * one-line one, but the error is a few percent of a window that overlaps its
 * neighbour by half, and the alternative is a measurement per row.
 */

/**
 * How far ahead of a row's own reading position the line reaches its node.
 *
 * This is what makes the draw the *cause* of the arrival rather than something
 * happening beside it — §1 of the teardown has the stage labels appear as the
 * line reaches them, and the stagger is a consequence of that rather than a
 * delay attached to a card. 0.13 of the travel is about 150px of scrolling on a
 * phone, which is enough to see the line get there first and not so much that
 * the two read as separate events.
 */
const LEAD = 0.13;

/** How long a row takes once the line has arrived, and how long a node takes. */
const ROW_TAIL = 0.02;
const NODE_SPAN = 0.02;

/** Before the list has been measured. The even spread, as a starting position only. */
const FALLBACK_FROM = 0.08;
const FALLBACK_TO = 0.62;

/** Where row `i` sits in the list's travel at the moment it is being read. */
function readingPoint(i: number, count: number, travel: number): number {
  if (travel <= 0) {
    const share = (FALLBACK_TO - FALLBACK_FROM) / count;
    return FALLBACK_FROM + share * (i + 0.5) + LEAD;
  }
  const viewport = typeof window === "undefined" ? 0 : window.innerHeight;
  const height = Math.max(0, travel - viewport);
  return (viewport / 2 + (height * (i + 0.5)) / count) / travel;
}

/**
 * What a row is handed: the list's track, and the slice of it that belongs to
 * this row. One subscription for the whole list rather than one per row, because
 * here the windows genuinely are the list's own geometry — the rows are evenly
 * spaced down a track the reader crosses once — which is the case a section-wide
 * progress is right for.
 */
export type SpineWindow = {
  progress: MotionValue<number>;
  from: number;
  to: number;
};

export function SpineList({
  count,
  renderRow,
  className,
  rowClassName,
}: {
  count: number;
  renderRow: (index: number, window: SpineWindow) => ReactNode;
  className?: string;
  /** The gap under a row, applied to every row but the last. */
  rowClassName?: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  const progress = useSectionProgress(list);
  const travel = useTravel(list);

  return (
    <ol ref={list} className={cn("flex flex-col", className)}>
      {Array.from({ length: count }, (_, i) => {
        const last = i === count - 1;
        // Where the line reaches this node, and where it reaches the next one.
        // The segment between them draws across exactly that gap, so the stroke
        // is continuous in time as well as in space.
        const arrival = readingPoint(i, count, travel) - LEAD;
        const nextArrival = readingPoint(i + 1, count, travel) - LEAD;

        return (
          // The gap between rows belongs to the *content* column, not to the row.
          // Put it on the row and the segment stops at the content box, leaving
          // the line broken between every node — five short strokes rather than
          // one spine, which is the opposite of what the device says.
          <li key={i} className="flex gap-4">
            <SpineSegment
              progress={progress}
              from={arrival}
              to={last ? arrival + NODE_SPAN : nextArrival}
              last={last}
            />
            <div className={cn("min-w-0 flex-1", !last && rowClassName)}>
              {renderRow(i, {
                progress,
                from: arrival,
                to: readingPoint(i, count, travel) + ROW_TAIL,
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The panel-over-panel cover, off its pin.
 *
 * `Cover` in `motion/scrub.tsx` travels in percentages of its own height, which
 * is exactly right when the covering panel is the whole of what has to clear the
 * clip. It is not right here. The well pads the panels by 26px so the halo's
 * ring and drop have somewhere to fall — `apparatus-panels.tsx` explains why
 * that padding cannot be given up — and a panel translated by 100% of its own
 * height therefore stops with its top edge 26px inside the well, showing a strip
 * of itself along the bottom before it has started.
 *
 * The pinned well solves this with `WELL_H`, a constant it can compute because
 * the panel height inside a pin is a constant. Off the pin it is not: the panels
 * take the height their content needs at whatever width the reader's phone is,
 * and the two are held equal by a grid stack rather than by a number. So the
 * distance is measured instead. `offsetHeight` is a layout measurement and a
 * transform does not affect layout, so the box being moved can be the box being
 * measured with no feedback between them.
 *
 * Deliberately still one property, and still not a fade. §3 of the teardown says
 * twice that the second panel *slides* over the first, and a panel arriving at
 * 60% opacity is two panels visible at once, which is the one reading the whole
 * device exists to prevent.
 */
export function CoverUp({
  progress,
  from,
  to,
  clearance,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  /** The box the panel has to clear. Measured by the caller, which owns the clip. */
  clearance: number;
  children: ReactNode;
  className?: string;
}) {
  const y = useTransform(progress, [from, to], [clearance, 0], { clamp: true });

  return (
    <motion.div data-scrub="" className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/** The height of a box, live. For a caller that has to move something past it. */
export function useBoxHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}

/* ---------------------------------------------------------------------------
   The rail.
   --------------------------------------------------------------------------- */

/**
 * A row of cards that scrolls sideways, one card to a screen.
 *
 * Four cards that are a 2x2 on a desktop become four full-width cards on a
 * phone, which is 2,000px of scrolling through four things that were meant to be
 * read as one set. A rail puts them back in one gesture: the reader sees the
 * whole group, moves through it at their own pace, and the page under it is
 * three hundred pixels shorter.
 *
 * Native scroll-snap, deliberately, and not a swipe handler. The database of UX
 * rules this was checked against is explicit that overriding a system gesture is
 * the way carousels go wrong, and everything here is the platform's own: the
 * momentum, the snap, the accessibility of a scroll container, and the keyboard.
 * `overscroll-x: contain` is the one addition, and it stops a flick at the end of
 * the rail turning into a browser back-navigation.
 *
 * The cards stay in document order and each is a list item, so a screen reader
 * and a keyboard both get the four in sequence whatever the rail is showing.
 * They are sized to leave the next one peeking, because a card that fills the
 * screen exactly is a card with no evidence that there is another one.
 *
 * The bar underneath is a position indicator, not decoration: it reads the
 * rail's own `scrollLeft` and is therefore the reader's finger drawn as a line.
 * It is not tagged `data-scrub` because it is not scroll-*driven* in the sense
 * that block in `globals.css` means — it responds to a gesture the reader is
 * making, which is not the class of motion the preference exists to switch off.
 */
export function Rail({
  children,
  label,
  className,
}: {
  children: ReactNode[];
  label: string;
  className?: string;
}) {
  const rail = useRef<HTMLUListElement>(null);
  const fraction = useMotionValue(0);
  const count = children.length;

  // The thumb is `1/count` of the bar, so its whole travel is `count - 1` of its
  // own widths. Expressing it that way needs no measurement of either box.
  const x = useTransform(fraction, (f) => `${f * (count - 1) * 100}%`);

  const onScroll = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const span = el.scrollWidth - el.clientWidth;
    fraction.set(span > 0 ? el.scrollLeft / span : 0);
  }, [fraction]);

  return (
    <div className={className}>
      {/* The gutter is undone and reapplied as padding so the rail bleeds to
          both edges of the screen while the first and last card still line up
          with the column above them. `scroll-padding` is what makes the snap
          land on that same line rather than on the screen edge. */}
      <ul
        ref={rail}
        onScroll={onScroll}
        aria-label={label}
        className="site-rail flex snap-x snap-mandatory items-start gap-4 overflow-x-auto overscroll-x-contain pt-1 pb-3"
        style={{
          marginInline: "calc(var(--site-gutter) * -1)",
          paddingInline: "var(--site-gutter)",
          scrollPaddingInline: "var(--site-gutter)",
        }}
      >
        {/* `items-start`, so a card is as tall as its own contents.
            Stretching them to agree is what a grid of cards wants and it is the
            wrong instinct here: one of these four carries an evidence panel and
            the others carry two sentences, so agreeing meant 250px of blank white
            inside three of them. On a snap rail the reader sees one card and the
            edge of the next, so unequal feet barely register, and blank space
            inside a card always does.

            82vw leaves about 30px of the next card showing past the gutter. A
            card that fills the screen exactly is a card with no evidence that
            there is another one, which on a rail is the whole problem. */}
        {children.map((child, i) => (
          <li key={i} className="flex w-[82vw] max-w-[360px] shrink-0 snap-start">
            {child}
          </li>
        ))}
      </ul>

      <div
        aria-hidden="true"
        className="mt-1 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: "var(--site-line)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ width: `${100 / count}%`, x, background: "var(--site-ink)" }}
        />
      </div>
    </div>
  );
}
