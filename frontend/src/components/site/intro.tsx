"use client";

import { useRef } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { Container } from "@/components/site/ui";
import { Pin, useReducedMotionGate, useSectionProgress } from "@/components/site/motion/scrub";
import { Arrive } from "@/components/site/motion/mobile";

/**
 * The intro: what a run produces, in one sentence and four words.
 *
 * The page's signature scroll moment opens it. A sentence set at 44px whose
 * words come up from 20% to full ink one at a time as you scroll through it.
 *
 * That reveal is scrubbed rather than tweened (`docs/MOTION_TEARDOWN.md` §1):
 * the section is a tall track with a sticky panel in it, and each word maps a
 * slice of the track's progress onto its own opacity. Nothing is queued, so a
 * reader who stops halfway stops halfway, one who scrolls back runs it
 * backwards, and one who flicks past gets the whole sentence.
 *
 * The four verdicts sit under it, because the sentence ends on what a run
 * produces and those four words are the whole vocabulary it produces it in. They
 * arrive one at a time on their own travel. They wear the full halo: they land
 * over the foot of a sentence set at 44px, and the ring alone was letting them
 * sit in that text rather than over it.
 */

const SENTENCE =
  "residual reads a paper's LaTeX source and reports where its own numbers, links and " +
  "citations disagree.";

const VERDICTS = ["matches", "within_tolerance", "diverges", "unverifiable"] as const;

const VERDICT_WORDS: Record<(typeof VERDICTS)[number], string> = {
  matches: "matches",
  within_tolerance: "within tolerance",
  diverges: "diverges",
  unverifiable: "unverifiable",
};

/** One word of the scrubbed sentence, holding its own slice of the track. */
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
  // The sentence finishes at 0.85 rather than 1, so the last word is lit while
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
 * The sentence, on `Pin` rather than on a hand-rolled sticky track.
 *
 * **Where 200vh comes from.** The track is the pin height less the one viewport
 * the sticky child holds, so 200vh is 100vh of scrolling, and the 16 words split
 * 0.85 of it: 5.3vh of scrolling per word, each word fading across 2.5 spans.
 * That is the pace this held at 260vh when the sentence was 26 words long, so
 * the second half of the sentence came out of the copy and the scroll distance
 * came out with it. A word's worth of pace is the constant, not the height.
 *
 * `clip={false}` keeps the comment on the section below honest: the frame must
 * not become a scroll container. `as="div"` because this sits inside
 * `<section id="intro">` already, and nesting a second sectioning element adds a
 * rung to the document outline in exchange for a scroll trick.
 *
 * `restClass=""` is the reduced-motion frame, and it is empty on purpose. A
 * sentence resolved at full ink has a natural height and no reason to be a
 * screen tall. `Pin` hands its resting children a constant progress of 1, so
 * every `Word` clamps to full ink with no scroll listener anywhere in the tree.
 */
function ScrubbedParagraph() {
  const words = SENTENCE.split(" ");

  return (
    // `dvh` is inside `Pin`, not here: on a phone with a retracting toolbar
    // `vh` and `dvh` differ by the height of the toolbar, and the frame is the
    // one box that must be exactly one viewport.
    <Pin
      as="div"
      height="200vh"
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
 * On their own travel rather than the sentence's: the row sits below the track,
 * so any window expressed in the track's progress would have to finish before
 * the row was on screen. `useSectionProgress` starts when the row enters from
 * the bottom and ends when it leaves the top, and the windows sit around the
 * middle of that, where the row is actually being looked at.
 *
 * The track here is the `ul` itself, which is 44px tall, and that is why these
 * numbers are what they are. Travel is `H + S`, 764px at a 720px viewport, so a
 * window of 0.14 was 100px of scrolling for all four pills together. Measured in
 * a browser: it was the shortest window on the page by a factor of two and it
 * resolved inside a single flick of a trackpad.
 *
 * The four share one geometry, so unlike every other group on this page their
 * stagger cannot come from where they sit. It is authored instead, and
 * `PILL_STEP` is the one number here chosen by eye: 0.075 of the travel is 57px
 * of scrolling between one pill and the next, which is the 60-80ms §4 of the
 * teardown asks for within a group once Lenis's 1.1s easing has converted it.
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

export function Intro() {
  return (
    // No `overflow-hidden` on this section, deliberately. It clips nothing, and
    // an ancestor with a clipped overflow is a scroll container, which is what a
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
      </Container>
    </section>
  );
}
