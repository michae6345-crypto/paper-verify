"use client";

import { useRef } from "react";

import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
import { Card, Container } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * How it decides.
 *
 * The four codes are `ReasonCode` in `backend/pv/models.py` — `multiple_bold_in_column`,
 * `metric_direction_unknown`, `cell_spans_columns`, `average_denominator_ambiguous` —
 * spelled exactly as the enum spells them, because they are what the report
 * prints and a reader who sees one in a report should recognise it here.
 *
 * The reference sets the descriptions at 12px in white at 50%, which is 12px of
 * text at 2.7:1. They are 13px at --site-muted-invert here, which is 5.9:1 on
 * this card. Same hierarchy, legible.
 *
 * Motion: the codes arrive one at a time against the section's own travel rather
 * than together. They are a list of four reasons a check declines, and reading
 * them as four separate admissions is the point — a card that fades in whole
 * presents them as one block of small print. The windows overlap heavily
 * (0.22→0.44, then every 0.05), so a reader who flicks past gets all four rather
 * than a queue, and one who scrolls back runs them out again.
 *
 * Not pinned. The card is `min-h-[428px]` plus a section tag above it, which at
 * 1100×640 leaves no margin inside a single viewport, and a pinned section whose
 * contents exceed the screen puts its own lower half out of reach.
 */

const REASONS: { code: string; description: string }[] = [
  {
    code: "multiple_bold_in_column",
    description: "More than one bolded value in a block, so there is no single best.",
  },
  {
    code: "metric_direction_unknown",
    description: "No arrow in the header and no entry in the direction table.",
  },
  {
    code: "cell_spans_columns",
    description: "The value sits in a multicolumn and belongs to no single column.",
  },
  {
    code: "average_denominator_ambiguous",
    description: "More than one plausible reading of the row reproduces the stated value.",
  },
];

/** Where the first reason starts, and how far apart the four are. */
const REASON_START = 0.22;
const REASON_SPAN = 0.22;
const REASON_STEP = 0.05;

export function Decides() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section
      ref={section}
      id="decides"
      className="scroll-mt-20 py-14 three:pt-[120px] three:pb-[160px]"
    >
      <Container>
        <SectionTag tag="How it decides" heading="A verdict is a pure function of its inputs" />

        <div className="mt-10 flex flex-col gap-12 three:mt-[60px] three:flex-row three:items-start three:gap-[60px]">
          <Scrub progress={progress} from={0.1} to={0.32} y={40} className="three:flex-1">
            {/* Standing off the page rather than resting on it. This section is a
                card and a paragraph, not a field of cards, so there is nothing for
                the card to rest among — it is the one object here and the reader
                should be able to see that it is in front of the page. */}
            <Card
              tone="dark"
              elevation="card"
              className="flex h-full flex-col items-start gap-7 p-10 three:min-h-[428px]"
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.5,
                  color: "#ffffff",
                }}
              >
                Reasons a check declines to answer
              </h3>
              <ul className="flex w-full flex-col gap-6">
                {REASONS.map((reason, i) => (
                  // The Scrub sits inside the `li` rather than around it: a
                  // `div` between `ul` and `li` is not a list any more.
                  <li key={reason.code}>
                    <Scrub
                      progress={progress}
                      from={REASON_START + i * REASON_STEP}
                      to={REASON_START + i * REASON_STEP + REASON_SPAN}
                      y={16}
                      blur={4}
                      className="flex flex-col gap-1"
                    >
                      <p
                        className="site-mono"
                        style={{ fontSize: "15px", lineHeight: 1.6, color: "#ffffff" }}
                      >
                        {reason.code}
                      </p>
                      <p
                        style={{
                          fontSize: "13px",
                          lineHeight: 1.5,
                          color: "var(--site-muted-invert)",
                        }}
                      >
                        {reason.description}
                      </p>
                    </Scrub>
                  </li>
                ))}
              </ul>
            </Card>
          </Scrub>

          <Scrub progress={progress} from={0.18} to={0.46} y={40} className="three:flex-[2]">
            <p
              className="max-w-[60ch]"
              style={{
                fontSize: "clamp(18px, 1.5vw, 20px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.5,
                color: "var(--site-ink)",
              }}
            >
              A language model never produces a verdict. Models extract structure; deterministic
              Python computes every verdict from it. So the same paper checked twice gives the same
              answer, and a check that cannot be made deterministic returns unverifiable with a
              stated reason rather than a guess.
            </p>
          </Scrub>
        </div>
      </Container>
    </section>
  );
}
