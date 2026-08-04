"use client";

import { useRef } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { Container } from "@/components/site/ui";
import {
  DrawLine,
  Pin,
  useReducedMotionGate,
  useSectionProgress,
} from "@/components/site/motion/scrub";
import { Arrive, Rise, useOwnTrack } from "@/components/site/motion/mobile";

/**
 * The intro: what a run produces, and why a venue wants it.
 *
 * The page's signature scroll moment opens it — a paragraph set at 44px whose
 * words come up from 20% to full ink one at a time as you scroll through it.
 *
 * That reveal is scrubbed, not tweened (`docs/MOTION_TEARDOWN.md` §1): the
 * section is a tall track with a sticky panel in it, and each word maps a slice
 * of the track's progress onto its own opacity. Nothing is queued, so a reader
 * who stops halfway stops halfway, one who scrolls back runs it backwards, and
 * one who flicks past gets the whole paragraph rather than a dropped animation.
 *
 * The track is `Pin` now rather than a second copy of it written here. Both
 * branches of the reduced-motion question are `Pin`'s too, and both use
 * `useReducedMotionGate` rather than `motion`'s `useReducedMotion` — this file
 * picks between structurally different trees in two places, which is exactly
 * where that hook renders one thing on the server and another on the client's
 * first frame and React throws the server's work away.
 *
 * The four verdicts sit under it, because the paragraph ends on what a run
 * produces and those four words are the whole vocabulary it produces it in. They
 * arrive one at a time on their own travel rather than all at once, which is the
 * same argument the paragraph makes about itself. They wear the full halo: they
 * land over the foot of a paragraph set at 44px, and the ring alone was letting
 * them sit in that text rather than over it.
 *
 * **What used to be at the top of this file.** An inverted full-bleed card
 * carrying "It verifies numbers, not content." It was the page's one rhythm break
 * and it spent a section of black on a disclaimer, which put the thing the
 * product refuses to do ahead of the thing it does. The refusal still holds and
 * the FAQ still states it; it no longer opens the argument. `IntakeNote` closes
 * the section instead, and the rhythm break it provides is a change of alignment
 * rather than a change of colour.
 */

const SENTENCE =
  "residual reads a paper's LaTeX source and reports where its own numbers, links and " +
  "citations disagree. The result is a permalink that travels with the submission.";

const VERDICTS = ["matches", "within_tolerance", "diverges", "unverifiable"] as const;

const VERDICT_WORDS: Record<(typeof VERDICTS)[number], string> = {
  matches: "matches",
  within_tolerance: "within tolerance",
  diverges: "diverges",
  unverifiable: "unverifiable",
};

/** One word of the scrubbed paragraph, holding its own slice of the track. */
function Word({
  word,
  index,
  count,
  progress,
}: {
  word: string;
  index: number;
  count: number;
  progress: MotionValue<number>;
}) {
  // The paragraph finishes at 0.85 rather than 1, so the last word is lit while
  // the panel is still pinned instead of on the frame it releases.
  const span = 0.85 / count;
  const start = index * span;
  const opacity = useTransform(progress, [start, start + span * 2.5], [0.2, 1], { clamp: true });

  return (
    <motion.span style={{ opacity }}>
      {word}
      {index < count - 1 ? " " : ""}
    </motion.span>
  );
}

const PARAGRAPH_STYLE = {
  fontSize: "clamp(24px, 3.5vw, 44px)",
  lineHeight: 1.4,
  letterSpacing: "-0.04em",
  color: "var(--site-ink)",
} as const;

/**
 * The paragraph, on `Pin` rather than on a hand-rolled sticky track.
 *
 * This used to build its own: a `h-[260vh]` div holding a `sticky top-0
 * h-[100dvh]` child, with its own `useScroll` at the same `start start` → `end
 * end` offsets `Pin` already uses. Two implementations of one mechanic, which is
 * the failure `CLAUDE.md` records as the reason this repo ended up with two
 * `latexutil.py` modules — nothing imported both, so no file read revealed it.
 *
 * `clip={false}` keeps the comment below this component honest: the frame must
 * not become a scroll container. `as="div"` because this sits inside
 * `<section id="intro">` already, and nesting a second sectioning element adds a
 * rung to the document outline in exchange for a scroll trick.
 *
 * `restClass=""` is the reduced-motion frame, and it is empty on purpose. A
 * paragraph resolved at full ink has a natural height and no reason to be a
 * screen tall. `Pin` hands its resting children a constant progress of 1, so
 * every `Word` clamps to full ink with no scroll listener anywhere in the tree —
 * which is what the deleted branch of this component was doing by hand.
 */
function ScrubbedParagraph() {
  const words = SENTENCE.split(" ");

  return (
    // `dvh` is inside `Pin`, not here: on a phone with a retracting toolbar
    // `vh` and `dvh` differ by the height of the toolbar, and the frame is the
    // one box that must be exactly one viewport.
    <Pin
      as="div"
      height="260vh"
      clip={false}
      className="relative"
      frameClass="flex items-center justify-center"
      restClass=""
    >
      {(progress) => (
        <p className="mx-auto max-w-[940px] text-center" style={PARAGRAPH_STYLE}>
          {words.map((word, i) => (
            <Word
              key={`${word}-${i}`}
              word={word}
              index={i}
              count={words.length}
              progress={progress}
            />
          ))}
        </p>
      )}
    </Pin>
  );
}

/**
 * The four verdicts, arriving in order as the row crosses the viewport.
 *
 * On their own travel rather than the paragraph's: the row sits below the track,
 * so any window expressed in the track's progress would have to finish before the
 * row was on screen. `useSectionProgress` starts when the row enters from the
 * bottom and ends when it leaves the top, and the windows are placed around the
 * middle of that, where the row is actually being looked at.
 *
 * The track here is the `ul` itself, which is 44px tall, and that is the whole
 * reason these numbers are what they are. Travel is `H + S` — 764px at a 720px
 * viewport — so a window of 0.14, which is what these held, was **100px of
 * scrolling** for all four pills together. Measured in a browser, not derived:
 * it was the shortest window on the page by a factor of two and it resolved
 * inside a single flick of a trackpad.
 *
 * The four share one geometry, so unlike every other group on this page their
 * stagger cannot come from where they sit — they sit in the same place. It is
 * authored instead, and `STEP` is the one number here chosen by eye rather than
 * by arithmetic: 0.075 of the travel is 57px of scrolling between one pill and
 * the next, which is the 60–80ms §4 of the teardown asks for within a group,
 * once Lenis's 1.1s easing is doing the conversion.
 */

/** How long one pill takes, and how far behind the previous one it starts. */
const PILL_SPAN = 0.4;
const PILL_STEP = 0.075;
function VerdictPill({ verdict }: { verdict: (typeof VERDICTS)[number] }) {
  return (
    <span
      className="flex items-center gap-2.5 px-5 py-2.5"
      style={{
        background: "var(--site-card)",
        borderRadius: "var(--site-radius-pill)",
        boxShadow: "var(--site-shadow-halo)",
      }}
    >
      <VerdictGlyph verdict={verdict} size={14} />
      <span style={{ fontSize: "15px", color: "var(--site-ink)" }}>{VERDICT_WORDS[verdict]}</span>
    </span>
  );
}

function ScrubbedVerdicts() {
  const row = useRef<HTMLUListElement>(null);
  const progress = useSectionProgress(row);

  return (
    <ul ref={row} className="mt-4 flex flex-wrap items-center justify-center gap-3">
      {VERDICTS.map((verdict, i) => (
        <li key={verdict}>
          <Arrive
            progress={progress}
            from={i * PILL_STEP}
            to={PILL_SPAN + i * PILL_STEP}
            lead={i * PILL_STEP}
            y={12}
            scale={[0.96, 1]}
          >
            <VerdictPill verdict={verdict} />
          </Arrive>
        </li>
      ))}
    </ul>
  );
}

function VerdictRow() {
  // The gate, not `motion`'s own hook: the two branches below render different
  // trees, and `useReducedMotion` disagrees with the server on the first client
  // render, so React discards the server markup for this subtree.
  const reduced = useReducedMotionGate();

  if (!reduced) return <ScrubbedVerdicts />;

  return (
    <ul className="mt-4 flex flex-wrap items-center justify-center gap-3">
      {VERDICTS.map((verdict) => (
        <li key={verdict}>
          <VerdictPill verdict={verdict} />
        </li>
      ))}
    </ul>
  );
}

/** The tag's flanking hairlines, fading out at both ends. */
function TagRule({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden="true"
      className="hidden h-px w-[69px] shrink-0 two:block"
      style={{
        opacity: 0.5,
        background: `linear-gradient(${side === "left" ? "90deg" : "270deg"}, rgba(84,84,84,0) 0%, var(--site-muted) 100%)`,
      }}
    />
  );
}

/**
 * The intake argument, and the section's change of rhythm.
 *
 * Everything above it on this page is centred: the hero, the tag, the paragraph,
 * the four verdicts. This is set against the left edge with the note dropped to
 * the opposite corner, which is `MOTION_TEARDOWN.md` §5's arrangement — body copy
 * held in a narrow column while the other side stays open — and it is the first
 * time the reader's eye has had to move since the top of the page.
 *
 * **Why three lines and no animation on them.** §2 of the same document records a
 * static two-tone headline: setup in mid-grey, punchline at full ink, same size
 * and weight throughout, nothing moving. Colour does the work, and it survives a
 * screenshot. The block still arrives as one object, because everything on this
 * page arrives, but the contrast between the setup and the punchline is not
 * animated and must not be — a per-line reveal would turn a sentence into a
 * countdown.
 *
 * **No figure, and none is coming.** "Submissions keep growing, reviewer hours do
 * not" is the claim, and it is stated qualitatively on purpose. This page holds
 * every number on it to something in the repository, and a growth rate for
 * conference submissions is not in the repository. A statistic here would be the
 * exact failure the product exists to catch, printed on the product's own page.
 *
 * The rule above it draws as the block arrives. It is `DrawLine`, which is the
 * page's existing stroke vocabulary rather than a second way of drawing a line,
 * and it collapses to a plain painted `path` under reduced motion with no spring
 * and no frame loop.
 *
 * **Both windows are measured, never fractions of the section.** `#intro`
 * contains a 260vh pin, so a window expressed as a slice of this section's travel
 * would be a wildly different number of pixels here than the pin's own numbers
 * assume, and on a phone different again. `useOwnTrack` and `Rise` each measure
 * `H + S` for their own box, so progress 0 is the frame the box's top edge
 * reaches the fold and 0.5 is its centre at the centre of the screen, at every
 * viewport and with no constant to go stale.
 */
function IntakeNote() {
  const box = useRef<HTMLDivElement>(null);
  const { progress, from, to } = useOwnTrack(box, "surface");

  return (
    <div ref={box} className="mt-20 two:mt-28">
      {/* Two units tall in the viewBox and 2px on the page with
          `preserveAspectRatio="none"`, so the rule stretches across the measure
          and the stroke is not stretched with it. The spine in `hero.tsx` is the
          same construction. */}
      <svg
        aria-hidden="true"
        className="h-0.5 w-full"
        viewBox="0 0 1000 2"
        preserveAspectRatio="none"
      >
        <g stroke="var(--site-line-strong)">
          <DrawLine
            progress={progress}
            from={from}
            to={from + (to - from) * 0.6}
            d="M0 1 H1000"
            strokeWidth={1}
          />
        </g>
      </svg>

      <div className="mt-10 flex flex-col gap-8 two:mt-14 two:flex-row two:items-end two:justify-between two:gap-16">
        {/* Each line is its own block rather than a `<br>`, so the colour can
            only ever change at a line boundary. On a phone a sentence wraps and
            a two-tone break landing mid-line would read as a mistake rather than
            as a device. */}
        <Rise kind="surface" y={16} boxClassName="two:max-w-[62%]" className="site-h2">
          <span className="block" style={SETUP}>
            Submissions keep growing.
          </span>
          <span className="block" style={SETUP}>
            Reviewer hours do not.
          </span>
          <span className="block">residual takes the first pass.</span>
        </Rise>

        <Rise
          kind="row"
          lead={0.08}
          y={12}
          boxClassName="two:max-w-[34ch]"
          className="site-body two:text-right"
        >
          It reports what diverges and names every check it declined to make.
        </Rise>
      </div>
    </div>
  );
}

/** The two setup lines of the two-tone statement. §2: mid-grey, then full ink. */
const SETUP = { color: "var(--site-muted)" } as const;

export function Intro() {
  return (
    // No `overflow-hidden` on this section, deliberately. It clips nothing — the
    // tag rules, the paragraph and the note are all inside the measure — and an
    // ancestor with a clipped overflow is a scroll container, which is what a
    // `position: sticky` descendant sticks to. The track below would pin to a box
    // that never scrolls, which is to say it would not pin at all.
    <section id="intro" className="site-section scroll-mt-20">
      <Container>
        <div className="flex items-center justify-center gap-6">
          <TagRule side="left" />
          <span className="site-display" style={{ fontSize: "24px", color: "var(--site-muted)" }}>
            What it does
          </span>
          <TagRule side="right" />
        </div>

        <ScrubbedParagraph />

        <VerdictRow />

        <IntakeNote />
      </Container>
    </section>
  );
}
