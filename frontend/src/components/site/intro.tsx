"use client";

import { useRef } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { Container, Card } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import {
  Pin,
  Scrub,
  useReducedMotionGate,
  useSectionProgress,
} from "@/components/site/motion/scrub";

/**
 * The intro: what this refuses to do, and then what it does.
 *
 * Two sections in the capture and two here. The first is a flat statement on an
 * inverted card and needs no motion at all. The second is the page's signature
 * scroll moment — a paragraph set at 44px whose words come up from 20% to full
 * ink one at a time as you scroll through it.
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
 * The inverted card at the top is the page's one rhythm break, and it is sized as
 * a break rather than as a screen. It held `min-h-[560px]` for two lines of copy,
 * which is a full viewport of black for eight words and reads as a section the
 * reader has to get past. It is 360 now, with the padding brought down to match,
 * so the floor is what sets the height at every width rather than the text
 * floating in the middle of an arbitrary box. It stands off the page rather than
 * resting on it, because a break in the rhythm that sits at the same depth as
 * everything else is not a break.
 */

const SENTENCE =
  "A paper states numbers, prints links, and cites prior work. residual reads the LaTeX " +
  "source, checks all three, and reports where they disagree. The result is a permalink " +
  "you attach to a submission and a reviewer opens.";

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
          <Scrub
            progress={progress}
            from={i * PILL_STEP}
            to={PILL_SPAN + i * PILL_STEP}
            y={12}
            scale={[0.96, 1]}
          >
            <VerdictPill verdict={verdict} />
          </Scrub>
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
    <>
      <section id="about" style={{ paddingInline: "var(--site-gutter)" }}>
        <Card
          tone="dark"
          elevation="card"
          className="mx-auto flex w-full max-w-[1440px] min-h-[360px] flex-col items-center justify-center gap-6 px-6 py-16 text-center two:px-[120px] two:py-24"
        >
          <Reveal>
            <h2 className="site-h2 mx-auto max-w-[900px]" style={{ color: "#ffffff" }}>
              It verifies numbers, not content.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p
              className="site-lede mx-auto max-w-[700px]"
              style={{ color: "var(--site-muted-invert)" }}
            >
              It has no opinion on whether a paper is novel, interesting, or correct in its ideas.
            </p>
          </Reveal>
        </Card>
      </section>

      {/* No `overflow-hidden` on this section, deliberately. It clips nothing —
          the tag rules and the paragraph are both inside the measure — and an
          ancestor with a clipped overflow is a scroll container, which is what a
          `position: sticky` descendant sticks to. The track below would pin to a
          box that never scrolls, which is to say it would not pin at all. */}
      <section id="intro" className="scroll-mt-20 py-20">
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
    </>
  );
}
