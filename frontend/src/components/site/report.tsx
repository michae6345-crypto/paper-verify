"use client";

import { useRef } from "react";

import { Card, Container } from "@/components/site/ui";
import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What a reviewer opens.
 *
 * The page had four sections about the checking and none about the thing the
 * checking produces, which left the venue argument as one clause in the hero.
 * This is that argument: a report is a document with properties, and the
 * properties are what make it worth attaching to a submission.
 *
 * All four are implemented, and each one is a real behaviour rather than a
 * promise:
 *
 *   permalink       `GET /runs/{id}/report/public` returns `PublicReport`.
 *   comparison      `Finding` carries `anchor`, `claimed`, `computed`, `delta`.
 *   held            `redact()` withholds `diverges` at `severity: high` until a
 *                   person releases it, and holding is the default — a finding
 *                   with no review decision recorded against it is held.
 *   answered        `Amendment` is append-only and never edits or deletes the
 *                   finding it answers.
 *
 * The paragraph under the card is the half that does not exist. There is no
 * signed identifier and no endpoint a venue can call, which is the difference
 * between a document an author hands over and one a venue can check for itself.
 * Saying so here rather than only in the roadmap matters, because this section
 * is where a chair would form the wrong expectation.
 *
 * Form: one wide card, not the card-left/paragraph-right pair that `decides` and
 * `roadmap` use. Those two argue; this one enumerates, and a spec sheet should
 * not look like an argument.
 *
 * Not pinned. Four rows plus a section tag and a paragraph exceed a short
 * viewport, and a pinned section taller than the screen hides its own lower half.
 */

const PROPERTIES: { term: string; detail: string }[] = [
  {
    term: "A permalink, not a score",
    detail: "No pass mark and no aggregate. Each check, its verdict, and what that verdict rests on.",
  },
  {
    term: "Every finding carries its comparison",
    detail: "Where in the source it sits, what the paper printed, what was computed, and the delta.",
  },
  {
    term: "High-severity divergences are held",
    detail: "They stay off the permalink until a person reads them. No setting turns that off.",
  },
  {
    term: "An author answers without deleting",
    detail: "A contest is recorded beside the finding, not in place of it. The recheck is deterministic.",
  },
];

/** Where the first row opens, how long each holds, and the gap between them. */
const ROW_START = 0.18;
const ROW_SPAN = 0.2;
const ROW_STEP = 0.05;

export function Report() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section id="report" ref={section} className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="The report" heading="What a reviewer opens" />

        <Scrub progress={progress} from={0.08} to={0.28} y={40} className="mt-10 three:mt-[60px]">
          <Card tone="dark" className="p-8 three:p-12">
            <dl className="flex flex-col">
              {PROPERTIES.map((property, i) => {
                const from = ROW_START + i * ROW_STEP;
                return (
                  // `dl > div > dt + dd` is the grouping HTML allows, which is
                  // what lets the scrub wrap a pair without breaking the list.
                  <Scrub
                    key={property.term}
                    progress={progress}
                    from={from}
                    to={from + ROW_SPAN}
                    y={16}
                    blur={4}
                    className={
                      i === 0
                        ? "flex flex-col gap-1 pb-6 two:flex-row two:gap-12"
                        : "flex flex-col gap-1 border-t border-t-[var(--site-line-invert)] pt-6 pb-6 two:flex-row two:gap-12"
                    }
                  >
                    <dt
                      className="two:w-[300px] two:shrink-0"
                      style={{
                        fontSize: "16px",
                        lineHeight: 1.6,
                        letterSpacing: "-0.01em",
                        color: "#ffffff",
                      }}
                    >
                      {property.term}
                    </dt>
                    <dd
                      className="max-w-[60ch]"
                      style={{
                        fontSize: "14px",
                        lineHeight: 1.6,
                        color: "var(--site-muted-invert)",
                      }}
                    >
                      {property.detail}
                    </dd>
                  </Scrub>
                );
              })}
            </dl>
          </Card>
        </Scrub>

        <Scrub progress={progress} from={0.42} to={0.62} y={32}>
          <p
            className="mt-10 max-w-[68ch]"
            style={{
              fontSize: "clamp(18px, 1.5vw, 20px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.5,
              color: "var(--site-ink)",
            }}
          >
            A venue does not have to trust the run. Every verdict states what it compared and which
            rule it applied, so a chair who disagrees can check the comparison rather than the tool.
            The other half is missing: there is no signed identifier and no endpoint a venue can
            call, so a report is something an author attaches, not something a venue confirms.
          </p>
        </Scrub>
      </Container>
    </section>
  );
}
