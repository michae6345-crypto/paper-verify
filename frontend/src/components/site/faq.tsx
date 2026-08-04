"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Card, Container, Mono, PrimaryLink } from "@/components/site/ui";
import { Rise } from "@/components/site/motion/mobile";
import { SectionTag } from "@/components/site/section-tag";

/**
 * The questions a reader actually arrives with.
 *
 * Native `<details>`, so the accordion works with JavaScript off and keeps the
 * platform's keyboard and screen-reader behaviour for free. The reference builds
 * its accordion out of a Framer component with a height tween.
 *
 * Two pieces of motion here, and keeping them apart is the point. The *arrival*
 * is scrubbed, so the questions come up in order as the section crosses the
 * screen and go back down if the reader scrolls up through it. The *disclosure*
 * is CSS on the open state, because a question opening has nothing to do with
 * where the page is scrolled to, and driving it from scroll would be a lie about
 * what caused it. That also keeps `<details>` native: no height measurement, no
 * JS accordion, still works with the scripts off.
 *
 * ---
 *
 * **Four questions, one paragraph each.** There were five, each answered in two
 * paragraphs, and the second paragraph was where the uncomfortable half lived.
 * That structure is what made the foot of this page read as an essay: 662 words
 * behind four chevrons. Every answer is one paragraph now and the uncomfortable
 * half is a clause inside it, which is a harder place to skip than a paragraph a
 * reader can stop before.
 *
 * The four that remain, chosen so no two can be answered by the same paragraph:
 *
 *   1. who reads a finding about me, and when      the review gate
 *   2. what happens to rounding                    the tolerance policy
 *   3. what it cannot read                         LaTeX only, no PDF path
 *   4. who answers when it is wrong                the determinism rule
 *
 * "Does the venue see my report, or do I" is gone as a question. Its first half
 * was `report.tsx`'s closing line already, and its second half, that an author
 * can decline to attach a report they dislike and nothing stops them, is now a
 * clause on that same line. One sentence, in the section that raised the
 * expectation, instead of 110 words four screens later.
 *
 * Every answer is defensible from a file in this repository, and the awkward
 * part of each is stated rather than managed. Question 1 ends on "the seventh
 * will not be caught by reading the code", question 3 says the gap is larger
 * than the papers it names, question 4 gives liability as the reason a model
 * never produces a verdict (`CLAUDE.md`: a probabilistic verdict published about
 * a named researcher is a liability). A page whose argument is that it publishes
 * what it cannot support does not get to answer its hardest question softly.
 *
 * ---
 *
 * **The heading no longer restates the tag.** "FAQ" over "The questions worth
 * asking" was the tag twice, the second time with a claim about itself attached.
 * The heading names who is asking, which is the thing the reader is checking for
 * when they decide whether the list is about them.
 *
 * **Every window is measured from the element that carries it.** The five
 * questions used to hold overlapping slices of the section's own travel, 0.192
 * stepping by 0.049, derived from a section measured at 771px tall. Removing one
 * question takes 73px out of that section and every one of those constants
 * becomes a slightly wrong distance. `Rise` gives each element its own track, so
 * the stagger is the list's own line spacing read as scroll distance and there
 * is nothing left to go stale. The card and the first question still open
 * together for free: both columns are `three:items-start`, so their top edges
 * reach the fold on the same frame.
 */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    // The most personal question on the page, so it goes first. The answer names
    // a person here rather than a system, because that is what is true.
    q: "It flags something in my paper. Who reads it before I do?",
    a: (
      <p>
        Someone here does, if the verdict is <Mono>diverges</Mono> at high severity. Those stay off
        the public report until a person has read them, and held is the default: a finding nobody
        has looked at is held. Six findings that should never have been made were caught during
        development, each one a lossy reading of a table that produced a confident accusation. The
        seventh will not be caught by reading the code.
      </p>
    ),
  },
  {
    q: "Is it going to fire on every rounding difference?",
    a: (
      <p>
        No. A value printed as <Mono>87.4</Mono> asserts one decimal place, so it carries an
        implicit tolerance of <Mono>0.05</Mono>, and that band comes off the paper&rsquo;s own
        precision. A gap inside it is reported as <Mono>within tolerance</Mono>, with its own glyph,
        and the comparison is attached either way so you see both numbers.
      </p>
    ),
  },
  {
    q: "You read the LaTeX. What about numbers that only exist in the PDF?",
    a: (
      <p>
        They are not checked. Some arXiv papers carry a PDF and no source at all, and a run on one
        of those comes back not checked against the whole paper, with <Mono>no latex source</Mono>{" "}
        as the reason. The gap is wider than those papers: anonymity, page limits and style
        compliance are properties of the compiled document, and no PDF path is built.
      </p>
    ),
  },
  {
    // Last, because the section after it asks for something, and this is the
    // question a reader has to have answered before they will grant it.
    // `q` is a plain string, not JSX, so the entity would render as its own
    // characters. The escape is the same glyph every `&rsquo;` on this page is.
    q: "If it is wrong about someone’s work, who answers for it?",
    a: (
      <p>
        We do, which is why a language model never produces a verdict here. A model may propose
        which cell a sentence refers to. Deterministic Python computes the verdict from that
        structure, and a claim that cannot be bound to a cell comes back <Mono>unverifiable</Mono>{" "}
        instead of guessed. None of the four checks running today calls a model at all. When we
        accept that a finding was wrong, withdrawing it writes a fixture that fails if the same
        reading ever returns.
      </p>
    ),
  },
];

/** Reading order down a list whose items each measure their own arrival. */
const QUESTION_LEAD = 0.03;

export function Faq() {
  return (
    <section id="faq" className="site-section scroll-mt-20">
      <Container>
        <SectionTag tag="FAQ" heading="What an author asks first" />

        <div className="site-stack flex flex-col gap-6 three:flex-row three:items-start three:gap-10">
          <Rise
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
                Three sections of this page end in a call to action and they have
                to be three different asks: read the evidence here, book a demo in
                the section below, run one yourself in the footer.

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
                Or{" "}
                <Link href="/check" style={{ color: "var(--site-ink)" }}>
                  check a paper
                </Link>{" "}
                and watch one from the start.
              </p>
            </Card>
          </Rise>

          <div className="min-w-0 three:flex-1">
            {FAQS.map((item, i) => (
              <Rise key={item.q} lead={i * QUESTION_LEAD} y={14}>
                <details className="group border-b" style={{ borderColor: "var(--site-line)" }}>
                  {/* `gap-4` at the narrow end: 24px between a three-line question
                      and the toggle is width a phone does not have to spare. */}
                  <summary
                    className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-5 transition-colors marker:content-none two:gap-6"
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
                      reduced-motion block in globals.css already flattens it. */}
                  <div
                    className="site-body max-w-[70ch] pb-6 group-open:animate-in group-open:fade-in group-open:slide-in-from-top-1 group-open:ease-out group-open:animation-duration-200"
                    style={{ fontSize: "15px" }}
                  >
                    {item.a}
                  </div>
                </details>
              </Rise>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
