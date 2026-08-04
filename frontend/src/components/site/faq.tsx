"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";

import { Card, Container, Mono, PrimaryLink } from "@/components/site/ui";
import { useSectionProgress } from "@/components/site/motion/scrub";
import { Arrive } from "@/components/site/motion/mobile";
import { SectionTag } from "@/components/site/section-tag";

/**
 * The questions a reader actually arrives with.
 *
 * Native `<details>`, so the accordion works with JavaScript off and keeps the
 * platform's keyboard and screen-reader behaviour for free. The reference builds
 * its accordion out of a Framer component with a height tween.
 *
 * Two pieces of motion here, and keeping them apart is the point. The *arrival*
 * is scrubbed: the questions hold overlapping slices of the section's own
 * travel, so they come up in order as the section crosses the screen and go back
 * down if the reader scrolls back up through it. The *disclosure* is CSS on the
 * open state, because a question opening has nothing to do with where the page
 * is scrolled to, and driving it from scroll would be a lie about what caused
 * it. That also keeps `<details>` native: no height measurement, no JS
 * accordion, still works with the scripts off.
 *
 * ---
 *
 * **Five, and each one is a question somebody would be uncomfortable asking out
 * loud.** The six that preceded them were the questions a product page wishes it
 * were asked. "Who is this for", "is this AI detection", "where do the numbers
 * come from" all have one-sentence answers, and three of the six were already
 * answered at more length by a section higher up the page. An accordion that
 * restates the page above it is padding with a chevron on it.
 *
 * What replaced them is the set an author with a draft and a chair with a stack
 * of submissions genuinely want to know, chosen so that no two of them can be
 * answered by the same paragraph:
 *
 *   1. who reads a finding about me, and when      the review gate
 *   2. who receives the report                     distribution, and gaming
 *   3. what happens to rounding                    the tolerance policy
 *   4. what it cannot read                         LaTeX only, no PDF path
 *   5. who answers when it is wrong                the determinism rule
 *
 * Every answer had to be defensible from a file in this repository, and the
 * uncomfortable half of each one is stated rather than managed. Question 1 ends
 * with "the seventh will not be caught by reading the code", question 2 says an
 * author can decline to attach the report and nothing stops them, question 4
 * says the gap is larger than the papers it names. A page whose argument is that
 * it publishes what it cannot support does not get to answer its hardest
 * question softly.
 *
 * Two of the illustrative questions are folded in rather than given a row of
 * their own. Gaming lives in question 2, because gaming only means anything if
 * somebody downstream is relying on the report, and the honest answer to both is
 * the same fact: nothing is sent anywhere. The model rule lives in question 5,
 * because liability is its actual justification (`CLAUDE.md`: a probabilistic
 * verdict published about a named researcher is a liability) and stating the
 * rule without the reason turns the strongest thing this product does into a
 * feature bullet.
 */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    // The most personal question on the page, so it goes first. The answer names
    // a person here rather than a system, because that is what is true.
    q: "It flags something in my paper. Who reads it before I do?",
    a: (
      <>
        <p>
          Someone here does, if the verdict is <Mono>diverges</Mono> at high severity. Those stay
          off the public report until a person has read them, and held is the default rather than a
          setting: a finding nobody has looked at is held, including one whose review record was
          lost. Nothing turns that off.
        </p>
        <p>
          The reason is unflattering. Six findings that should never have been made were caught
          during development, and every one was the same shape, a lossy reading of a table that
          produced a confident accusation. The seventh will not be caught by reading the code,
          because by definition we did not think of it.
        </p>
      </>
    ),
  },
  {
    q: "Does the venue see my report, or do I?",
    a: (
      <>
        <p>
          You do, and nothing is sent anywhere. There is no signed identifier and no endpoint a
          chair can call, so a report is a document an author attaches to a submission rather than
          something a venue confirms for itself.
        </p>
        <p>
          Which answers the question underneath it. An author who dislikes what a run found can
          decline to attach it, and today nothing stops that. What a report can carry is its own
          provenance: each verdict records the checker version and the tolerance version that
          produced it, so an old report cannot pass as a current one. A report a venue can verify
          without the author is work nobody has done yet.
        </p>
      </>
    ),
  },
  {
    q: "Is it going to fire on every rounding difference?",
    a: (
      <>
        <p>
          No, and the band comes off the page rather than from us. A value printed as{" "}
          <Mono>87.4</Mono> asserts one decimal place of precision, so it carries an implicit
          tolerance of <Mono>0.05</Mono>. Accuracy and BLEU keep that floor even where a paper
          quotes them to three places, because those scores are not stable to the digit they are
          printed at.
        </p>
        <p>
          A gap inside the band is reported as <Mono>within tolerance</Mono>, a verdict of its own
          with its own word and its own glyph, and the comparison is attached either way so you see
          both numbers. The bands live in one versioned file, and every verdict records which
          version judged it, so revising a band replays over comparisons already stored instead of
          re-reading the papers.
        </p>
      </>
    ),
  },
  {
    q: "You read the LaTeX. What about numbers that only exist in the PDF?",
    a: (
      <>
        <p>
          They are not checked. Some arXiv papers carry a PDF and no source at all, and a run on one
          of those comes back not checked against the whole paper, with{" "}
          <Mono>no latex source</Mono> as the reason.
        </p>
        <p>
          The gap is wider than those papers. Anonymity, page limits and style compliance are
          properties of the compiled document rather than of the source, so none of them can be
          checked either until a PDF path exists, and none of that is built. What reading the source
          buys is exactness: a table arrives as cells with their rule-delimited blocks intact and
          their macros expanded, which a rendered page does not give back.
        </p>
      </>
    ),
  },
  {
    // Last, because the section after it asks for something, and this is the
    // question a reader has to have answered before they will grant it.
    // `q` is a plain string, not JSX, so the entity would render as its own
    // characters. The escape is the same glyph every `&rsquo;` on this page is.
    q: "If it is wrong about someone’s work, who answers for it?",
    a: (
      <>
        <p>
          We do, which is why a language model never produces a verdict here. A model may propose
          which cell a sentence refers to. Deterministic Python computes the verdict from that
          structure, and a claim that cannot be bound to a cell comes back{" "}
          <Mono>unverifiable</Mono> instead of guessed. None of the four checks running today calls
          a model at all.
        </p>
        <p>
          The rest is process rather than a guarantee. A verdict is a function of the claim, the
          checker version, the tolerance version and the commit it ran against, so any finding can
          be rebuilt a year later from the inputs that produced it. Contesting a finding never
          suppresses it, because a contest that could remove one would be a way to bury a true
          finding as easily as a wrong one. When we accept that a finding was wrong, withdrawing it
          writes a fixture that fails if the same reading ever returns.
        </p>
      </>
    ),
  },
];

/**
 * The slice of the section's travel one question holds. `SPACING` is smaller
 * than `WINDOW`, so the third is still arriving while the fourth has started: a
 * stagger expressed as overlap rather than as a queue of delays, which is what
 * lets a fast scroll compress the sequence instead of playing it back.
 *
 * The five are not measured individually. Measured in a browser at 1536x720 the
 * section is 771px tall, so travel is 1491px, and the questions sit a uniform
 * 73px apart, which is the 0.049 spacing. One constant and an index does the
 * whole list, and the stagger is the list's own line spacing read as scroll
 * distance.
 *
 * The 73px survived losing a row because every summary is still one line: the
 * questions got longer in characters, not in height. What did change is the
 * section, from 832px to 771px, and that is the whole argument for stating a
 * window in pixels. `WINDOW` is the row budget `motion/scrub.tsx` records,
 * 0.52H + h/2, which at this viewport is 411px and at this travel is 0.276.
 * Carrying the old 0.265 across would have quietly shortened every arrival by
 * 16px of scrolling for no reason anyone chose.
 *
 * The direction that matters is unchanged. A window that resolves early costs a
 * little movement; one that resolves late leaves a question sitting invisible
 * while it is being read.
 */
const FIRST = 0.192;
const SPACING = 0.049;
const WINDOW = 0.276;

/**
 * The card beside them. It is a surface, so it arrives as one, on the surface
 * budget of 0.60H (432px, or 0.29 of this travel). It opens at the same 0.192 as
 * the first question because it is the same top edge: the two columns are
 * `three:items-start`, so they reach the fold together.
 */
const CARD_FROM = 0.192;
const CARD_TO = 0.482;

export function Faq() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section id="faq" ref={section} className="site-section scroll-mt-20">
      <Container>
        <SectionTag tag="FAQ" heading="The questions worth asking" />

        <div className="site-stack flex flex-col gap-6 three:flex-row three:items-start three:gap-10">
          <Arrive
            progress={progress}
            from={CARD_FROM}
            to={CARD_TO}
            kind="surface"
            y={12}
            scale={[0.96, 1]}
            lift="card"
            boxClassName="three:w-[380px] three:shrink-0"
          >
            {/* The card stands off the page and the questions beside it do not get
                a surface at all. They are `<details>`, so a card behind them would
                grow and shrink every time one opened, and a plane that changes
                size as you read it is not a plane. Hairlines on the field are the
                right form for a list that resizes itself.

                Its control points at a finished report rather than at `/check`.
                Three sections of this page now end in a call to action and they
                have to be three different asks: read the evidence here, book a
                demo in the section below, run one yourself in the footer. A third
                `Check a paper` button would have made the last screen of the page
                repeat itself twice.

                `elevation="none"`: the shadow is scrubbed on the layer above so
                it arrives with the card, and the prop would write a second one. */}
            <Card elevation="none" className="flex flex-col gap-5 p-6 two:gap-6 two:p-8">
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.6,
                  color: "var(--site-ink)",
                }}
              >
                A contest never removes a finding. Your answer sits beside it.
              </h3>
              <PrimaryLink href="/reports/1810.04805" className="self-start">
                Read a finished report
              </PrimaryLink>
              <p className="site-body" style={{ fontSize: "14px" }}>
                The recheck is deterministic: the same claim at the same checker version produces
                the same answer. That is what makes a finding defensible a year after it was made.{" "}
                <Link href="/check" style={{ color: "var(--site-ink)" }}>
                  Check a paper
                </Link>{" "}
                to see one from the start.
              </p>
            </Card>
          </Arrive>

          <div className="min-w-0 three:flex-1">
            {FAQS.map((item, i) => (
              <Arrive
                key={item.q}
                progress={progress}
                from={FIRST + i * SPACING}
                to={FIRST + i * SPACING + WINDOW}
                y={14}
              >
                <details className="group border-b" style={{ borderColor: "var(--site-line)" }}>
                  <summary
                    className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 transition-colors marker:content-none"
                    style={{
                      fontSize: "clamp(17px, 1.5vw, 20px)",
                      fontWeight: 400,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.6,
                      color: "var(--site-ink)",
                      transitionDuration: "var(--dur-fast)",
                    }}
                  >
                    <span>{item.q}</span>
                    <span
                      aria-hidden="true"
                      className="site-mono shrink-0"
                      style={{ fontSize: "16px", color: "var(--site-muted)" }}
                    >
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:inline">&minus;</span>
                    </span>
                  </summary>
                  {/* The disclosure, and the whole of it. The answer is in the
                      document only while the details is open, so the enter
                      animation runs on the frame the browser reveals it. The
                      reduced-motion block in globals.css already flattens it.

                      `gap-4` because every answer is two paragraphs now. The
                      first says what happens, the second says the part that is
                      awkward, and running them together would let a reader stop
                      at the reassuring half. */}
                  <div
                    className="site-body flex max-w-[70ch] flex-col gap-4 pb-6 group-open:animate-in group-open:fade-in group-open:slide-in-from-top-1 group-open:ease-out group-open:animation-duration-200"
                    style={{ fontSize: "15px" }}
                  >
                    {item.a}
                  </div>
                </details>
              </Arrive>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
