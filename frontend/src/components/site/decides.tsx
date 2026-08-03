"use client";

import { useRef, type ReactNode } from "react";

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
 * presents them as one block of small print. The windows overlap heavily, so a
 * reader who flicks past gets all four rather than a queue, and one who scrolls
 * back runs them out again.
 *
 * The numbers come from the section's geometry. It is 1021px tall, so travel at
 * a 720px viewport is 1741px; the card's top sits 393px down it and each reason
 * is 91px below the last. Every window opens on the frame its own top edge
 * reaches the fold, which is that offset over the travel, and runs for a fixed
 * distance in pixels rather than a fixed fraction of the section.
 *
 * The card's old window was 0.1 → 0.32, and a browser driven through it put the
 * card at **opacity 1.00 on the frame its centre first came over the fold**: the
 * largest object in the section did all of its arriving underneath the screen.
 * It opens at 0.226 now, which is the frame its top edge appears, and it is the
 * one thing in this section a reader was most likely to have meant by "the
 * animation does nothing".
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

/** The card: 0.248 of 1741px is 432px of scrolling, all of it on screen. */
const CARD_FROM = 0.226;
const CARD_TO = 0.474;

/**
 * Where the first reason starts, and how far apart the four are.
 *
 * 0.052 is the 91px between one reason and the next over the section's travel,
 * so the stagger is the list's own line spacing read as scroll distance. The
 * 0.234 span is 408px, against 383px before — the change here is placement
 * rather than duration, because these four were the one group in the section
 * already animating somewhere visible.
 */
const REASON_START = 0.309;
const REASON_SPAN = 0.234;
const REASON_STEP = 0.052;

/**
 * The paragraph, on its own travel rather than the section's.
 *
 * It is the one element here whose position moves with the breakpoint: above
 * `three:` it is the right-hand column with its top level with the card's, and
 * below it the columns stack and it is the last thing in the section. Those are
 * two completely different offsets, and a window expressed as a fraction of the
 * section can only be right for one of them — tuned for the desktop it resolved
 * a screen below the fold on a phone, and tuned for the phone it would still be
 * arriving as it left the top of a laptop.
 *
 * Its own track removes the question. `useSectionProgress` on a box that holds
 * only this paragraph starts when the paragraph reaches the fold and ends when
 * it leaves the top, whatever is above or beside it, so `0 → 0.52` is 437px of
 * scrolling ending with the paragraph just under halfway up the screen at every
 * viewport. The cost is one more scroll subscription, and the rule worth taking
 * from it is: an element whose place in its section changes with the layout
 * should be measured against itself.
 */
const NOTE_FROM = 0;
const NOTE_TO = 0.52;

/** The paragraph, measured against itself. See `NOTE_FROM` for why. */
function ClosingNote({ children }: { children: ReactNode }) {
  const note = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(note);

  return (
    <div ref={note} className="three:flex-[2]">
      <Scrub progress={progress} from={NOTE_FROM} to={NOTE_TO} y={20}>
        {children}
      </Scrub>
    </div>
  );
}

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
          <Scrub
            progress={progress}
            from={CARD_FROM}
            to={CARD_TO}
            y={12}
            scale={[0.96, 1]}
            lift="card"
            className="three:flex-1"
          >
            {/* Standing off the page rather than resting on it. This section is a
                card and a paragraph, not a field of cards, so there is nothing for
                the card to rest among — it is the one object here and the reader
                should be able to see that it is in front of the page.

                `elevation="none"`, because the shadow is on the scrubbed layer
                above and it arrives with the card instead of being there from the
                first frame. The prop writes an inline `box-shadow`, so leaving it
                set would put two of them on one surface. */}
            <Card
              tone="dark"
              elevation="none"
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
                    {/* No blur. Text resolving out of a blur reads as a font
                        failing to load, and §4 of the teardown spends that effect
                        once, on the one element that matters — which on this page
                        is the hero's verdict, not four lines of small print. */}
                    <Scrub
                      progress={progress}
                      from={REASON_START + i * REASON_STEP}
                      to={REASON_START + i * REASON_STEP + REASON_SPAN}
                      y={14}
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

          <ClosingNote>
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
          </ClosingNote>
        </div>
      </Container>
    </section>
  );
}
