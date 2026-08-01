import Link from "next/link";
import type { ReactNode } from "react";

import { Card, Container, Mono, PrimaryLink } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SectionTag } from "@/components/site/section-tag";

/**
 * Questions worth asking.
 *
 * Native `<details>`, so the accordion works with JavaScript off and keeps the
 * platform's keyboard and screen-reader behaviour for free. The reference builds
 * its accordion out of a Framer component with a height tween; the only motion
 * here is a 120ms colour change on the summary, which is the whole of what an
 * accordion needs.
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
        Two people. An author, before submitting, who wants the numbers in the paper checked and a
        report to attach. A reviewer or area chair, who would otherwise redo the arithmetic in a
        table by hand, or skip it. It verifies numbers, not content, so it does not replace review.
        It takes one mechanical part off it.
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
        Four things. That each bolded value is the best in its rule-delimited block. That a column
        labelled average matches the mean of its row. That the URLs printed in the paper still
        resolve. That every reference in the bibliography exists. Anything beyond those four is on
        the roadmap and is not running.
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

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="FAQ" heading="Questions worth asking" />

        <div className="mt-10 flex flex-col gap-6 three:mt-12 three:flex-row three:items-start three:gap-10">
          <Reveal className="three:w-[380px] three:shrink-0">
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
          </Reveal>

          <Reveal delay={0.08} className="min-w-0 three:flex-1">
            <div>
              {FAQS.map((item) => (
                <details
                  key={item.q}
                  className="group border-b"
                  style={{ borderColor: "var(--site-line)" }}
                >
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
                  <div className="site-body max-w-[70ch] pb-6" style={{ fontSize: "15px" }}>
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
