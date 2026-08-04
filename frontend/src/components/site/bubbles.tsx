"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import type { MotionValue } from "motion/react";

import { Scrub } from "@/components/site/motion/scrub";

/**
 * The two windows that flank the headline.
 *
 * The Framer template this page was ported from set two image bubbles into its
 * hero headline, and they were the first thing anyone noticed about it. They did
 * not survive the port, because what they held was the template's own demo
 * imagery. This puts the device back and fills it with something we can stand
 * behind.
 *
 * ---
 *
 * **What the template actually did**, measured off the live page rather than
 * guessed at. Two windows, one per headline line, `148 × 113` at a 110px
 * headline whose line box is 124px. They are flex siblings interleaved with
 * headline fragments — `[Unlimited] [window] [Design]`, then `[for] [window]
 * [Solid Startups]` — so they sit *inside* the line box and cost the hero
 * nothing vertically. `border-radius: 36px`, which is 32% of their height.
 * `overflow: hidden`, and a six-stop drop shadow offset down and right. Each one
 * held a vertical ticker cycling fourteen images.
 *
 * Three of those four facts are worth keeping and one is not.
 *
 * Kept: **the window is shorter than the line it sits in.** That is the entire
 * reason the device is affordable here. `hero.tsx` budgets 608px against a 700px
 * viewport and the headline's 166px is already the largest single item in it, so
 * a band above or below the headline would end the pin. These are
 * `position: absolute` inside a wrapper whose height is exactly the headline's,
 * which makes the cost **0px** by construction rather than by arithmetic that
 * could go stale.
 *
 * Kept: the proportion. 113/124 is 0.91 of the line box. The pinned headline
 * here is 72px at line-height 1.15, so the line box is 82.8px and 0.91 of that
 * is 75px. At 4:3 that is `100 × 75`, which is what these are. The radius
 * follows the same way: 32% of 75 is 24px, which is `--site-radius-card`
 * exactly. No new token, and the shape is the reference's.
 *
 * Kept: the shadow. `--site-shadow-halo` is already the 8px white ring plus a
 * drop offset down and right, and `globals.css` records that it was read out of
 * this same capture. It is the right treatment for an element that has to read
 * as detached from the field behind it, which is what a window beside a headline
 * is.
 *
 * **Dropped: the ticker.** An image cycling on a loop is an animation that never
 * arrives anywhere, it runs whether or not anyone is looking at it, and it would
 * be the only thing on this page not driven by the reader's own scroll. The hero
 * is already a pinned scrub; a second, independent clock inside it would fight
 * the one mechanic the page is built on. These resolve once, against scroll,
 * like everything else here.
 *
 * ---
 *
 * **What is inside them, which is the part that mattered.**
 *
 * This product's whole claim is that it publishes nothing it cannot support. A
 * decorative photograph on its marketing page would be a fabricated claim on the
 * page arguing against fabricated claims, so both windows hold real material out
 * of this repository and nothing else.
 *
 * Left is the source: nine lines of `fixtures/papers/1706.03762/results.tex`,
 * verbatim, starting at the `\hline` that opens the ensembles block. Those nine
 * lines carry almost every hazard `CLAUDE.md` warns about at once — `\textbf`
 * and `\boldmath` as two spellings of bold, `\specialrule` segmenting the table
 * into blocks, a `\multicolumn` belonging to no single column, `\rule` spacing
 * junk glued to cell content, `\citep` inside a label cell, scientific notation
 * in math mode, and the empty spacer column written as a bare `& &`.
 *
 * Right is what the parser makes of it: the same table, `tab:wmt-results`, drawn
 * as structure. One mark per real cell, the header band, a rule wherever the
 * block index changes, the four genuinely bold cells in ink, and the spacer
 * column drawn as the gap it is. Empty cells are drawn as nothing, because an
 * empty cell means "not reported" and never zero.
 *
 * So the pair reads left to right as the product's one sentence: this is what a
 * paper prints, and this is what we make of it. The headline sits between them.
 *
 * Neither is legible at 100px and neither is meant to be. At that size the
 * contrast that carries is texture — lines of code against a grid — and both
 * textures are real.
 *
 * Regenerate both, from the repo root:
 *
 *     python fixtures/make_plates.py
 *
 * which reads `frontend/src/fixtures/reports/1706.03762.json` for the structure
 * and `fixtures/papers/1706.03762/results.tex` for the source, and writes into
 * `frontend/public/assets/`. Nothing about either plate is drawn by hand.
 *
 * ---
 *
 * **Why they disappear below 1280px, rather than shrinking.**
 *
 * The headline is `mx-auto max-w-[1000px]` under a flex column with
 * `items-center`, so its box is exactly 1000px wherever the container allows it.
 * A window needs its own 100px plus 20px of separation, so it needs 120px of
 * clear space beside the headline. The container's inner width is the viewport
 * less `--site-gutter`, which is 48px until 1440 and 120px above it:
 *
 *     1440   inner 1200, clear (1200-1000)/2 = 100, plus 120 gutter = 220  ok
 *     1280   inner 1184, clear             92, plus  48 gutter = 140       ok
 *     1152   inner 1056, clear             28, plus  48 gutter =  76       no
 *
 * 1280 is where it stops fitting, so 1280 is the gate. Below it the windows do
 * not render at all, which is the honest outcome: at 390px the headline fills
 * the screen and there is no empty horizontal space to put anything in. Shrinking
 * them to fit would put two illegible smudges against the one thing on the page
 * that has to be read first.
 *
 * The gate is a layout effect rather than `useReducedMotion` or a render-time
 * `matchMedia`, for the reason `motion/scrub.tsx` sets out at length: a hook that
 * reads one value on the server and another on the first client render is a
 * hydration mismatch, and React does not reconcile attribute differences during
 * hydration. Here both the server and the first client render produce `null`, so
 * there is nothing to mismatch, and the effect then adds an absolutely positioned
 * overlay — which cannot shift layout because it is out of flow.
 */

/** `useLayoutEffect` warns when React renders on the server, so alias it there. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Where the windows stop fitting beside a 1000px headline. Derived above, not
 * chosen: it is the smallest viewport at which the clear space either side of
 * the headline still holds a 100px window and its 20px of separation.
 */
const GATE = "(min-width: 1280px)";

function useHasRoom(): boolean {
  const [room, setRoom] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const query = window.matchMedia(GATE);
    const update = () => setRoom(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return room;
}

/**
 * The two plates, and what each one is.
 *
 * `alt` is written out rather than left empty. These are not decoration: they
 * are the two halves of the argument the headline makes, and a reader who cannot
 * see them is better served by being told what they are than by being told
 * nothing. Sentence case, and no verdict vocabulary, because neither plate
 * carries a verdict.
 */
const PLATES = [
  {
    key: "source",
    src: "/assets/bubble-source.svg",
    alt: "Nine lines of LaTeX source from the Transformer paper's results table, showing bold commands and the rules that segment the table into blocks.",
  },
  {
    key: "structure",
    src: "/assets/bubble-structure.svg",
    alt: "The same table parsed into structure: one mark per cell, a rule at each block boundary, the bolded cells in ink, and the empty spacer column drawn as a gap.",
  },
] as const;

/**
 * The window itself.
 *
 * `--site-radius-card` on the frame and on the image, because a rounded frame
 * with a square child shows its corners the moment the image is not the exact
 * colour of the page behind it. `overflow-clip` rather than `overflow-hidden`
 * for the reason `scrub.tsx` gives: hidden creates a scroll container, and this
 * sits inside a pinned frame with sticky ancestors.
 *
 * The image is `object-cover`, but the plate is authored at 4:3 and the frame is
 * 4:3, so nothing is actually cropped. Cover is there so a future plate at a
 * different aspect fills the window rather than letterboxing inside it.
 */
function Window({ plate }: { plate: (typeof PLATES)[number] }) {
  return (
    <span
      className="block overflow-clip"
      style={{
        width: "100px",
        height: "75px",
        background: "var(--site-card)",
        borderRadius: "var(--site-radius-card)",
        boxShadow: "var(--site-shadow-halo)",
      }}
    >
      {/* Not `next/image`: these are fixed-size SVGs with no variants to
          generate and no layout to reserve, so the loader would add a build
          step and a wrapper element for nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={plate.src}
        alt={plate.alt}
        width={100}
        height={75}
        className="block h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

/**
 * Wrap the hero headline in this. It renders the headline unchanged and hangs a
 * window off each side of it.
 *
 * The wrapper is a plain `position: relative` block whose only in-flow child is
 * the headline, so its height *is* the headline's height and the windows, being
 * absolute, add nothing to it. That is the whole reason this is a wrapper rather
 * than a sibling: a sibling would need to know where the headline is, and would
 * cost a flex gap even at zero height.
 *
 * `right-full` and `left-full` place each window immediately outside the
 * headline's own box with 20px of separation, so they track the measure at every
 * viewport without a single hard-coded offset. The vertical offsets put the left
 * window against the top of the headline and the right window against the
 * bottom, which is the reference's diagonal rather than a symmetrical pair. Both
 * sit well inside a two-line headline's 166px, so neither reaches past it.
 *
 * `progress` is optional. Passed, the windows scrub in against the hero's pin on
 * a short stagger, arriving before the spine finishes drawing so they are
 * settled by the time anything else is. Omitted — which is what the static hero
 * below the pin gate wants — they simply render, and no scroll value is read.
 */
export function HeroBubbles({
  children,
  progress,
}: {
  children: ReactNode;
  progress?: MotionValue<number>;
}) {
  const room = useHasRoom();

  if (!room) return <>{children}</>;

  const [source, structure] = PLATES;

  return (
    <div className="relative">
      {children}

      <span className="pointer-events-none absolute top-[4%] right-full mr-5 block">
        {progress ? (
          <Scrub progress={progress} from={0.04} to={0.16} y={14} scale={[0.96, 1]}>
            <Window plate={source} />
          </Scrub>
        ) : (
          <Window plate={source} />
        )}
      </span>

      <span className="pointer-events-none absolute bottom-[4%] left-full ml-5 block">
        {progress ? (
          <Scrub progress={progress} from={0.1} to={0.22} y={14} scale={[0.96, 1]}>
            <Window plate={structure} />
          </Scrub>
        ) : (
          <Window plate={structure} />
        )}
      </span>
    </div>
  );
}
