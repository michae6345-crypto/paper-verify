"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";

import { Card, Container, Mono, PrimaryLink } from "@/components/site/ui";
import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
import { SectionTag } from "@/components/site/section-tag";

/**
 * Questions worth asking.
 *
 * Native `<details>`, so the accordion works with JavaScript off and keeps the
 * platform's keyboard and screen-reader behaviour for free. The reference builds
 * its accordion out of a Framer component with a height tween.
 *
 * Two pieces of motion here, and keeping them apart is the point. The *arrival*
 * is scrubbed: the seven questions hold overlapping slices of the section's own
 * travel, so they come up in order as the section crosses the screen and go back
 * down if the reader scrolls back up through it. The *disclosure* is CSS on the
 * open state, because a question opening has nothing to do with where the page
 * is scrolled to, and driving it from scroll would be a lie about what caused
 * it. That also keeps `<details>` native — no height measurement, no JS
 * accordion, still works with the scripts off.
 *
 * The seven questions and their answers are the reference's, verbatim. The one
 * change is the apostrophe in "researcher's", which the capture holds as a
 * mojibake byte.
 */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Who is this for?",
    a: (
      <p>
        Two people. An author, before submitting, who wants the paper checked and a report to
        attach. A reviewer or area chair, who would otherwise work through a table, a set of URLs
        and a bibliography by hand, or skip them. It verifies numbers, not content, so it does not
        replace review. It takes one mechanical part off it.
      </p>
    ),
  },
  {
    q: "What if you are wrong?",
    a: (
      <p>
        Every finding carries a contest action one click away. Contested findings are recorded and
        rechecked, and the recheck is deterministic, so a corrected input produces a corrected
        verdict. Contesting a finding does not suppress it: if it did, contesting would become the
        way to bury a true finding. Any high-severity diverges finding is held for human review
        before it appears publicly.
      </p>
    ),
  },
  {
    q: "Does a language model decide any of this?",
    a: (
      <p>
        No. A language model never produces a verdict. Models extract structure only, such as which
        cells are in a table and which claim refers to which cell. Every verdict is computed by
        deterministic Python from that structure. The four checks in the first release call no
        model at all.
      </p>
    ),
  },
  {
    q: "Is this AI detection?",
    a: (
      <p>
        No. It says nothing about how a paper was written. It reads the numbers the paper states
        and recomputes them.
      </p>
    ),
  },
  {
    q: "Why does so much come back unverifiable?",
    a: (
      <p>
        Because saying nothing beats saying something wrong about a named researcher&rsquo;s work.
        When a table cannot be read without discarding something a verdict might rest on, the check
        returns unverifiable with a stated reason and attaches the comparison as evidence, so you
        still see the numbers. A run that declines to answer often is working as intended.
      </p>
    ),
  },
  {
    q: "What does it check?",
    a: (
      <p>
        Four things, in two families. Against the paper itself: that each bolded value is the best
        in its rule-delimited block, and that a column labelled average matches the mean of its
        row. Against the world outside it: that the URLs printed in the paper still resolve, and
        that every reference in the bibliography exists and has not been retracted. Anything beyond
        those four is on the roadmap and is not running.
      </p>
    ),
  },
  {
    q: "Where do the numbers come from?",
    a: (
      <p>
        The LaTeX source, not the PDF. A paper is often many files joined by <Mono>input</Mono> and{" "}
        <Mono>include</Mono>, with macros defined in one file and used in another, so the source is
        resolved and the macro table built before anything is parsed.
      </p>
    ),
  },
];

/**
 * The slice of the section's travel one question holds. `SPACING` is smaller
 * than `WINDOW`, so the fourth is still arriving while the fifth has started —
 * a stagger expressed as overlap rather than as a queue of delays, which is what
 * lets a fast scroll compress the sequence instead of playing it back.
 *
 * The last window closes at 0.59 of the section's travel. That is deliberately
 * early: a window that resolves before its question reaches the middle of the
 * screen costs a little of the movement, and one that resolves late leaves a
 * question sitting invisible on screen. The seven are not measured individually
 * — they share one subscription and differ only in their window.
 */
const FIRST = 0.22;
const SPACING = 0.04;
const WINDOW = 0.13;

export function Faq() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section id="faq" ref={section} className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="FAQ" heading="Questions worth asking" />

        <div className="mt-10 flex flex-col gap-6 three:mt-12 three:flex-row three:items-start three:gap-10">
          <Scrub
            progress={progress}
            from={0.08}
            to={0.26}
            y={40}
            className="three:w-[380px] three:shrink-0"
          >
            <Card className="flex flex-col gap-6 p-8">
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.6,
                  color: "var(--site-ink)",
                }}
              >
                Every finding has a contest action one click away.
              </h3>
              <PrimaryLink href="/check" className="self-start">
                Check a paper
              </PrimaryLink>
              <p className="site-body" style={{ fontSize: "14px" }}>
                Contested findings are recorded and rechecked. The recheck is deterministic, so a
                corrected input produces a corrected verdict. See{" "}
                <Link href="/reports/1810.04805" style={{ color: "var(--site-ink)" }}>
                  a finished report
                </Link>
                .
              </p>
            </Card>
          </Scrub>

          <div className="min-w-0 three:flex-1">
            {FAQS.map((item, i) => (
              <Scrub
                key={item.q}
                progress={progress}
                from={FIRST + i * SPACING}
                to={FIRST + i * SPACING + WINDOW}
                y={20}
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
                      reduced-motion block in globals.css already flattens it. */}
                  <div
                    className="site-body max-w-[70ch] pb-6 group-open:animate-in group-open:fade-in group-open:slide-in-from-top-1 group-open:ease-out group-open:animation-duration-200"
                    style={{ fontSize: "15px" }}
                  >
                    {item.a}
                  </div>
                </details>
              </Scrub>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
