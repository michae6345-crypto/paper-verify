"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { Container, Card } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";

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
 * The four verdicts sit under it, because the paragraph ends on what a run
 * produces and those four words are the whole vocabulary it produces it in.
 */

const SENTENCE =
  "A paper states numbers in its abstract, its body text and its tables. residual reads " +
  "the LaTeX source, recomputes what can be recomputed, and reports where the paper " +
  "disagrees with itself. The result is a permalink an author can attach to a submission " +
  "and a reviewer can open.";

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
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
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

function ScrubbedParagraph() {
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const words = SENTENCE.split(" ");

  // Under reduced motion there is no track, no sticky panel and no scroll
  // subscription — the paragraph is simply a paragraph, at its final ink.
  if (reduced) {
    return (
      <p
        className="mx-auto max-w-[940px] text-center"
        style={{
          fontSize: "clamp(24px, 3.5vw, 44px)",
          lineHeight: 1.4,
          letterSpacing: "-0.04em",
          color: "var(--site-ink)",
        }}
      >
        {SENTENCE}
      </p>
    );
  }

  return (
    <div ref={track} className="relative h-[260vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center">
        <p
          className="mx-auto max-w-[940px] text-center"
          style={{
            fontSize: "clamp(24px, 3.5vw, 44px)",
            lineHeight: 1.4,
            letterSpacing: "-0.04em",
            color: "var(--site-ink)",
          }}
        >
          {words.map((word, i) => (
            <Word
              key={`${word}-${i}`}
              word={word}
              index={i}
              count={words.length}
              progress={scrollYProgress}
            />
          ))}
        </p>
      </div>
    </div>
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
          className="mx-auto flex w-full max-w-[1440px] min-h-[560px] flex-col items-center justify-center gap-6 px-6 py-24 text-center two:px-[120px] two:py-[160px]"
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

      <section id="intro" className="scroll-mt-20 overflow-hidden py-20">
        <Container>
          <div className="flex items-center justify-center gap-6">
            <TagRule side="left" />
            <span className="site-display" style={{ fontSize: "24px", color: "var(--site-muted)" }}>
              What it does
            </span>
            <TagRule side="right" />
          </div>

          <ScrubbedParagraph />

          <ul className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {VERDICTS.map((verdict) => (
              <li
                key={verdict}
                className="flex items-center gap-2.5 px-5 py-2.5"
                style={{
                  background: "var(--site-card)",
                  borderRadius: "var(--site-radius-pill)",
                  boxShadow: "0 0 0 8px rgba(255,255,255,0.35)",
                }}
              >
                <VerdictGlyph verdict={verdict} size={14} />
                <span style={{ fontSize: "15px", color: "var(--site-ink)" }}>
                  {VERDICT_WORDS[verdict]}
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
