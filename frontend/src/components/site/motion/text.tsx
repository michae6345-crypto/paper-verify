"use client";

import { MotionValue, motion, useTransform } from "motion/react";
import { Fragment, useMemo, useRef, type ElementType, type ReactNode } from "react";

import { EASE, type Curve } from "@/components/site/motion/easing";
import { useOwnTrack } from "@/components/site/motion/mobile";
import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { staggerWindows, type ScrubWindow } from "@/components/site/motion/stagger";

/**
 * Text that arrives a piece at a time.
 *
 * The page has exactly one of these — `intro.tsx`'s scrubbed paragraph, whose
 * words come up from 20% ink to full as the reader scrolls through the pin — and
 * it is hand-rolled. Per-line, per-word and per-character reveals are most of
 * what a Framer site does with type, and `docs/FRAMER_MOTION_NOTES.md` §3 has the
 * research. This is that mechanic as three primitives, with the accessibility
 * and the line-wrapping handled once instead of at every call site.
 *
 * ---
 *
 * **The layout problem, which is the one that quietly ruins a split.** Splitting
 * a paragraph into spans breaks line wrapping unless the spans are laid out
 * exactly right. A transform only applies to an element with a box, so every
 * animated unit has to be `inline-block` — and an `inline-block` cannot be
 * broken across lines. Put the whole line in one, and it will not wrap. Put a
 * space *inside* one, and the browser has nowhere to break, so a long paragraph
 * runs off the side of a phone.
 *
 * So the structure is fixed and it is not negotiable:
 *
 *   - Every **word** is an `inline-block`, so it moves as a unit and never
 *     breaks in the middle.
 *   - The **spaces between words are real text nodes** between those blocks,
 *     which is where the browser is allowed to break the line.
 *   - In character mode each word gets a plain `inline-block` wrapper and the
 *     characters are `inline-block`s inside it, so a word still never breaks but
 *     each letter can move on its own.
 *
 * That is why nothing here takes `children`. A split has to own the text as a
 * string to be able to put the spaces back in the right places; handed arbitrary
 * nodes it would have to walk and rebuild them, and the first `<em>` or `<a>` in
 * the copy would be flattened. A caller that needs markup inside a reveal wants
 * `Scrub` around the whole block, not a split.
 *
 * ---
 *
 * **The accessibility problem, and why `aria-label` is not the answer here even
 * though it is the answer everywhere on the internet.** Every guide to splitting
 * text — GSAP's SplitText docs, the CSS-IRL write-up, the Motion recipes — says
 * to put `aria-label` on the container and `aria-hidden` on the pieces. That is
 * correct advice for a `<div role="img">` and wrong for us, because **ARIA
 * prohibits naming on the `paragraph`, `generic`, `emphasis` and `strong` roles**
 * — which is to say on `<p>`, `<div>` and `<span>`, which is what display copy
 * on this page actually is. An `aria-label` on a `<p>` is not a name; it is
 * ignored, and the split spans underneath it are still `aria-hidden`, so the
 * paragraph is announced as empty. The technique's failure mode is silent and it
 * is total.
 *
 * What is done instead is split by risk, because the risk is not uniform:
 *
 *   - **Word and line splits keep their text and are not hidden from anything.**
 *     An `inline-block` span containing a whole word is still phrasing content
 *     with a text node in it; assistive technology concatenates the paragraph as
 *     written, find-in-page matches, and selection copies clean text. There is
 *     nothing to fix, so nothing is done. This is the mode almost every consumer
 *     should use.
 *   - **Character splits carry a hidden copy.** One character per element does
 *     genuinely defeat some screen readers, so a character split renders the
 *     real sentence once in an `sr-only` span and marks the visual layer
 *     `aria-hidden`. The `sr-only` copy is `user-select: none`, so copying the
 *     paragraph still yields the text once rather than twice.
 *
 * The honest cost of the character mode, stated rather than buried: the sentence
 * is in the DOM twice, so find-in-page can land on the invisible copy. That is
 * the trade, it only applies to the mode a consumer has to opt into, and it is
 * the reason `by` defaults to `"word"`.
 *
 * ---
 *
 * All three primitives collapse to plain text under the motion gate — not a
 * shorter animation and not a resolved split, but the original string in the
 * original element, with no spans, no `sr-only` duplicate and no scroll
 * subscription. `useReducedMotionGate` from `motion/scrub`, never
 * `useReducedMotion` from `motion/react`; the module comment there explains at
 * length why the difference is a hydration bug rather than a preference.
 */

/* ---------------------------------------------------------------------------
   Splitting.
   --------------------------------------------------------------------------- */

/** Word: one animated unit per word. Char: one per character, grouped by word. */
export type SplitMode = "word" | "char";

/** The tags a reveal is allowed to be. Phrasing content, plus the headings. */
export type TextTag = "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "li";

type Split = {
  /** One entry per word; each entry is that word's animated units. */
  groups: string[][];
  /** The flat index of each group's first unit, so a group can address windows. */
  offsets: number[];
  /** How many animated units in total. The length every window array must have. */
  count: number;
};

/**
 * Split once, and hand the same object to both the window arithmetic and the
 * renderer.
 *
 * Splitting twice — once to count and once to draw — is how a windows array ends
 * up one shorter than the units it is indexed by, and an element reading
 * `windows[i].from` off `undefined` is a crash rather than a wrong number. There
 * is one call, and the count is derived from the same arrays that are rendered.
 *
 * `Array.from` rather than `split("")` for characters, so an astral character is
 * one unit rather than two broken halves. It still separates a combining mark
 * from the letter it belongs to; the copy on this page is Latin text where that
 * does not arise, and the alternative (`Intl.Segmenter`) has to produce
 * byte-identical output on the server and in the browser to survive hydration,
 * which is a stronger guarantee than it is worth here.
 */
function splitText(text: string, by: SplitMode): Split {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const groups = by === "char" ? words.map((word) => Array.from(word)) : words.map((word) => [word]);

  const offsets: number[] = [];
  let count = 0;
  for (const group of groups) {
    offsets.push(count);
    count += group.length;
  }

  return { groups, offsets, count };
}

/**
 * The word/space/unit scaffold, shared by the scrubbed and the appear reveals.
 *
 * `renderUnit` gets the unit's text and its flat index, and returns the animated
 * element. Everything about *where the boxes go* lives here so the two consumers
 * cannot disagree about it.
 */
function SplitLayout({
  split,
  by,
  renderUnit,
}: {
  split: Split;
  by: SplitMode;
  renderUnit: (unit: string, index: number) => ReactNode;
}) {
  return (
    <>
      {split.groups.map((units, w) => (
        <Fragment key={w}>
          {/* A real space, in a text node, outside every inline-block. The only
              place the browser is permitted to break the line. */}
          {w > 0 ? " " : null}
          {by === "char" ? (
            <span className="inline-block">
              {units.map((unit, u) => renderUnit(unit, split.offsets[w] + u))}
            </span>
          ) : (
            renderUnit(units[0], split.offsets[w])
          )}
        </Fragment>
      ))}
    </>
  );
}

/** The container, with the hidden copy a character split needs and a word split does not. */
function SplitFrame({
  as,
  className,
  text,
  by,
  children,
}: {
  as: TextTag;
  className?: string;
  text: string;
  by: SplitMode;
  children: ReactNode;
}) {
  const Tag = as as ElementType;

  if (by !== "char") return <Tag className={className}>{children}</Tag>;

  return (
    <Tag className={className}>
      <span className="sr-only" style={SR_ONLY_STYLE}>
        {text}
      </span>
      <span aria-hidden="true">{children}</span>
    </Tag>
  );
}

/** So a copy of the paragraph yields the visible text once, not twice. */
const SR_ONLY_STYLE = { userSelect: "none" } as const;

/* ---------------------------------------------------------------------------
   Scrubbed: the reader's scroll position drives it.
   --------------------------------------------------------------------------- */

/**
 * One unit of a scrubbed split.
 *
 * The same four transforms `ScrubbedBox` in `motion/scrub.tsx` builds, on an
 * inline box instead of a block one, and reading the same `data-scrub` attribute
 * so the reduced-motion rule in `globals.css` resolves it along with everything
 * else.
 *
 * `dim` rather than a hardcoded 0 because the strongest version of this gesture
 * is not a fade from nothing: `intro.tsx` runs its words from 20% ink to full,
 * so the sentence is legible as a whole the entire time and the scrub lights it
 * rather than assembling it. That is the safer default for body copy, and it is
 * the one case on this page where a reader can never be shown an empty
 * paragraph.
 */
function ScrubUnit({
  progress,
  from,
  to,
  y,
  blur,
  dim,
  ease,
  children,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  y: number;
  blur: number;
  dim: number;
  ease?: Curve;
  children: ReactNode;
}) {
  const opacity = useTransform(progress, [from, to], [dim, 1], { clamp: true, ease });
  const ty = useTransform(progress, [from, to], [y, 0], { clamp: true, ease });
  const b = useTransform(progress, [from, to], [blur, 0], { clamp: true, ease });
  const filter = useTransform(b, (v) => (v > 0.01 ? `blur(${v}px)` : "none"));

  return (
    // No `willChange`. Setting it as a static string on a motion component makes
    // Motion skip its own management of the property entirely — `addValueToWillChange`
    // in `motion-dom` only acts when the value is absent or is a `WillChange`
    // motion value — so a hand-set hint is strictly worse than none. It would
    // also promote one compositing layer per word, which on a paragraph is
    // dozens of layers held for the life of the page.
    <motion.span data-scrub="" className="inline-block" style={{ opacity, y: ty, filter }}>
      {children}
    </motion.span>
  );
}

export type ScrubTextProps = {
  /** The sentence. A string, not nodes — see the module comment. */
  text: string;
  /** One unit per word, or per character. Default `word`; read the a11y note. */
  by?: SplitMode;
  /**
   * The track to scrub against. **Omit it and the block measures its own**,
   * which is what a consumer should do unless the text is inside a `Pin` whose
   * travel it has to share. `mobile.tsx` records what happens when a window is a
   * fraction of a section instead: thirty of seventy-nine elements animating
   * below the fold on a phone.
   *
   * Whether it is supplied has to be stable across renders — the two cases are
   * different components, because the self-measuring one opens a scroll
   * subscription the bound one must not.
   */
  progress?: MotionValue<number>;
  /** Where in `progress` the first unit opens. Ignored when self-measuring. */
  from?: number;
  /** Where the last unit closes. Ignored when self-measuring. */
  to?: number;
  /** How concurrent neighbouring units are. See `motion/stagger.ts`. */
  overlap?: number;
  /** Self-measuring only: how far into its own travel the sequence starts. */
  lead?: number;
  /** Pixels each unit rises through. Small: this is type, not a card. */
  y?: number;
  /** Blur each unit starts at, in pixels. Off by default. */
  blur?: number;
  /** The opacity a unit starts at. 0.2 for body copy, 0 for a hard reveal. */
  dim?: number;
  ease?: Curve;
  as?: TextTag;
  className?: string;
};

/**
 * A sentence whose words light up as the reader scrolls through it.
 *
 * ```tsx
 * <ScrubText as="p" text={LEDE} dim={0.2} className="site-lede" />
 * ```
 *
 * With no `progress` it measures its own track, so the sequence starts as the
 * paragraph's top edge reaches the fold and finishes before its centre passes
 * the middle of the screen — at every viewport, with no constant to go stale.
 * Inside a `Pin`, hand it the pin's progress and a window instead:
 *
 * ```tsx
 * <ScrubText progress={p} from={0.32} to={0.58} text={LEDE} by="char" dim={0} />
 * ```
 */
export function ScrubText({
  text,
  by = "word",
  progress,
  from = 0,
  to = 1,
  overlap,
  lead = 0,
  y = 6,
  blur = 0,
  dim = 0,
  ease = EASE.glide,
  as = "p",
  className,
}: ScrubTextProps) {
  const reduced = useReducedMotionGate();

  if (reduced) {
    const Tag = as as ElementType;
    return <Tag className={className}>{text}</Tag>;
  }

  const shared = { text, by, overlap, y, blur, dim, ease, as, className };

  if (progress) return <ScrubTextBody {...shared} progress={progress} from={from} to={to} />;
  return <SelfScrubText {...shared} lead={lead} />;
}

type ScrubTextBodyProps = {
  text: string;
  by: SplitMode;
  overlap?: number;
  y: number;
  blur: number;
  dim: number;
  ease?: Curve;
  as: TextTag;
  className?: string;
};

function ScrubTextBody({
  progress,
  from,
  to,
  text,
  by,
  overlap,
  y,
  blur,
  dim,
  ease,
  as,
  className,
}: ScrubTextBodyProps & {
  progress: MotionValue<number>;
  from: number;
  to: number;
}) {
  const split = useMemo(() => splitText(text, by), [text, by]);
  const windows = useMemo(
    () => staggerWindows(split.count, { from, to, overlap }),
    [split.count, from, to, overlap],
  );

  return (
    <SplitFrame as={as} className={className} text={text} by={by}>
      <SplitLayout
        split={split}
        by={by}
        renderUnit={(unit, i) => (
          <ScrubUnit
            key={i}
            progress={progress}
            from={windows[i].from}
            to={windows[i].to}
            y={y}
            blur={blur}
            dim={dim}
            ease={ease}
          >
            {unit}
          </ScrubUnit>
        )}
      />
    </SplitFrame>
  );
}

/**
 * Measuring its own track.
 *
 * `useOwnTrack` from `motion/mobile.tsx` rather than a fourth implementation of
 * the same measurement. It was written for the narrow layout but nothing in it
 * is narrow-specific: it measures `H + S` for the element and turns a budget in
 * pixels of the *viewport* into a fraction of that travel, which is the rule
 * `motion/scrub.tsx` states and is correct at every width. Reimplementing it
 * here is exactly the two-`latexutil.py` failure `CLAUDE.md` describes — two
 * modules doing the same four things differently, with nothing importing both.
 *
 * The ref goes on the container, which is never transformed; only the unit spans
 * inside it are. So there is no path from the animation back into the
 * measurement, which is the feedback `Rise` warns about.
 */
function SelfScrubText({ lead, ...rest }: ScrubTextBodyProps & { lead: number }) {
  const box = useRef<HTMLDivElement>(null);
  const { progress, from, to } = useOwnTrack(box, "row", lead);

  return (
    <div ref={box}>
      <ScrubTextBody {...rest} progress={progress} from={from} to={to} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The masked line reveal.
   --------------------------------------------------------------------------- */

export type LineMaskProps = {
  /**
   * The lines, as the caller wants them broken. **Given, not measured** — see
   * the note on `LineMask` for why this refuses to detect its own line breaks.
   */
  lines: string[];
  progress?: MotionValue<number>;
  from?: number;
  to?: number;
  overlap?: number;
  lead?: number;
  ease?: Curve;
  as?: TextTag;
  className?: string;
  /** On each line's mask. Where a caller puts per-line colour or leading. */
  lineClassName?: string;
};

/**
 * Lines that rise out from behind their own edge.
 *
 * The one text gesture a Framer site is most recognisable for: each line sits in
 * a box that clips, starts translated down by its own height, and slides up to
 * rest. Nothing fades — the mask does all the hiding, so the line is either
 * fully absent or fully inked and there is never a half-opacity headline on
 * screen. That is the same argument `Cover` makes in `motion/scrub.tsx` for
 * refusing to crossfade, one element down.
 *
 * ```tsx
 * <LineMask
 *   as="h2"
 *   lines={["Marketing didn't", "get harder.", "It got stuck."]}
 *   lineClassName="site-display"
 * />
 * ```
 *
 * ---
 *
 * **Why the lines are given rather than measured, which is the interesting
 * decision.** GSAP's SplitText and Motion+'s `splitText` both detect real line
 * boxes: render the words, read where each one landed, group by vertical
 * position, wrap each group. It is genuinely better for body copy, and it is
 * refused here for three reasons that are specific to this page.
 *
 * It needs a second pass. The component renders words, measures, then re-renders
 * with wrappers — so the first committed frame has the wrong structure, and this
 * codebase spends most of `motion/scrub.tsx`'s module comment on the principle
 * that the first painted frame must already be right.
 *
 * It is not stable. Line boxes move when a webfont swaps in, and this page loads
 * webfonts; they move again on every resize, and re-splitting inside a `Pin`
 * changes the frame's height, which trips the `ResizeObserver` in
 * `useOverflowWarning` and re-measures the track that the reveal is scrubbing
 * against. A measurement that feeds its own input is the failure `Rise` is
 * built to avoid.
 *
 * And it is not needed. A masked line reveal is a *display type* gesture. Body
 * copy reflows and should be revealed by word, which `ScrubText` does without
 * measuring anything. Display type on this page is already hard-broken by the
 * designer, because where a headline breaks is a typographic decision and not
 * something to leave to a viewport. The caller already knows its lines; asking
 * for them is cheaper and more honest than inferring them.
 *
 * The consequence a caller must accept: **a line that wraps will be masked
 * wrong**, because the mask is one line tall and the text is two. Keep the
 * strings short enough to hold at 390px, or let the smallest viewport render
 * plain by not using this there.
 */
export function LineMask({
  lines,
  progress,
  from = 0,
  to = 1,
  overlap,
  lead = 0,
  ease = EASE.arrive,
  as = "div",
  className,
  lineClassName,
}: LineMaskProps) {
  const reduced = useReducedMotionGate();

  if (reduced) {
    const Tag = as as ElementType;
    return (
      <Tag className={className}>
        {lines.map((line, i) => (
          <span key={i} className={["block", lineClassName].filter(Boolean).join(" ")}>
            {line}
          </span>
        ))}
      </Tag>
    );
  }

  const shared = { lines, overlap, ease, as, className, lineClassName };

  if (progress) return <LineMaskBody {...shared} progress={progress} from={from} to={to} />;
  return <SelfLineMask {...shared} lead={lead} />;
}

type LineMaskBodyProps = {
  lines: string[];
  overlap?: number;
  ease?: Curve;
  as: TextTag;
  className?: string;
  lineClassName?: string;
};

function LineMaskBody({
  progress,
  from,
  to,
  overlap,
  lines,
  ease,
  as,
  className,
  lineClassName,
}: LineMaskBodyProps & {
  progress: MotionValue<number>;
  from: number;
  to: number;
}) {
  const Tag = as as ElementType;
  const windows = useMemo(
    () => staggerWindows(lines.length, { from, to, overlap }),
    [lines.length, from, to, overlap],
  );

  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        <MaskedLine
          key={i}
          progress={progress}
          window={windows[i]}
          ease={ease}
          className={lineClassName}
        >
          {line}
        </MaskedLine>
      ))}
    </Tag>
  );
}

/**
 * The clip box extends below the text box by a fraction of an em and the same
 * amount is taken back off the flow, so descenders have somewhere to be while
 * the line is at rest and the following line still sits where it would have.
 * Without it a `g` or a `y` is sheared off flat along the bottom of every line,
 * which is the tell that a mask reveal was built by someone who only tested it
 * on a headline with no descenders in it.
 */
const DESCENDER = "0.16em";
const MASK_STYLE = { paddingBottom: DESCENDER, marginBottom: `-${DESCENDER}` } as const;

function MaskedLine({
  progress,
  window: w,
  ease,
  className,
  children,
}: {
  progress: MotionValue<number>;
  window: ScrubWindow;
  ease?: Curve;
  className?: string;
  children: ReactNode;
}) {
  // Percentages of the element's own height, so the line clears its own mask at
  // any type size with nothing measured.
  const y = useTransform(progress, [w.from, w.to], ["100%", "0%"], { clamp: true, ease });

  return (
    <span className="block overflow-clip" style={MASK_STYLE}>
      <motion.span
        data-scrub=""
        className={["block", className].filter(Boolean).join(" ")}
        style={{ y }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function SelfLineMask({ lead, ...rest }: LineMaskBodyProps & { lead: number }) {
  const box = useRef<HTMLDivElement>(null);
  const { progress, from, to } = useOwnTrack(box, "row", lead);

  return (
    <div ref={box}>
      <LineMaskBody {...rest} progress={progress} from={from} to={to} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Appear: fires once, on arrival.
   --------------------------------------------------------------------------- */

export type RevealTextProps = {
  text: string;
  by?: SplitMode;
  /** Pixels each unit rises through. */
  y?: number;
  /** Blur each unit starts at. Framer's text effects ship this and it is cheap here. */
  blur?: number;
  /** Seconds per unit. */
  duration?: number;
  /** Seconds between one unit starting and the next. Framer's own default is 0.05. */
  stagger?: number;
  /** Seconds before the first unit starts. */
  delay?: number;
  ease?: Curve;
  /** How much of the block must be on screen before it fires. */
  amount?: number;
  as?: TextTag;
  className?: string;
};

/**
 * The same split, fired once when the block arrives.
 *
 * This is Framer's *appear effect* rather than its scroll transform: it plays at
 * its own pace and then it is over, so it is the right choice anywhere the
 * reader is not being asked to drive — a heading in a section that does not pin,
 * a caption, anything under the fold that only has to arrive once. Where the
 * reader *is* driving, `ScrubText` is the one that matches the page.
 *
 * ```tsx
 * <RevealText as="h3" text="What the checker cannot see" by="char" blur={6} />
 * ```
 *
 * Built on variants and `staggerChildren` rather than a computed delay per unit,
 * which means the whole sequence is one declaration and Motion schedules it —
 * the pattern the framer-motion guidance calls for, and the one that does not
 * grow a `useMemo` per character.
 *
 * `once: true` on the viewport, deliberately. A reveal that replays every time
 * the reader scrolls back up is a page that will not sit still to be read.
 */
export function RevealText({
  text,
  by = "word",
  y = 14,
  blur = 0,
  duration = 0.55,
  stagger = 0.045,
  delay = 0,
  ease = EASE.glide,
  amount = 0.35,
  as = "p",
  className,
}: RevealTextProps) {
  const reduced = useReducedMotionGate();
  const split = useMemo(() => splitText(text, by), [text, by]);

  const container = useMemo(
    () => ({
      hidden: {},
      shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
    }),
    [stagger, delay],
  );

  const unit = useMemo(
    () => ({
      hidden: { opacity: 0, y, ...(blur > 0 ? { filter: `blur(${blur}px)` } : null) },
      shown: {
        opacity: 1,
        y: 0,
        ...(blur > 0 ? { filter: "blur(0px)" } : null),
        transition: { duration, ease },
      },
    }),
    [y, blur, duration, ease],
  );

  const viewport = useMemo(() => ({ once: true, amount }), [amount]);

  if (reduced) {
    const Tag = as as ElementType;
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <SplitFrame as={as} className={className} text={text} by={by}>
      <motion.span
        className="inline"
        variants={container}
        initial="hidden"
        whileInView="shown"
        viewport={viewport}
      >
        <SplitLayout
          split={split}
          by={by}
          renderUnit={(unitText, i) => (
            <motion.span key={i} data-scrub="" data-reveal="" className="inline-block" variants={unit}>
              {unitText}
            </motion.span>
          )}
        />
      </motion.span>
    </SplitFrame>
  );
}
