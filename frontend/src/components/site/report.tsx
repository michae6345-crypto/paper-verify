"use client";

import { Card, Container } from "@/components/site/ui";
import { Rise } from "@/components/site/motion/mobile";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What a reviewer opens: a report is a document with properties, and the
 * properties are what make it worth attaching to a submission.
 *
 * All four are implemented today:
 *
 *   permalink       `GET /runs/{id}/report/public` returns `PublicReport`.
 *   comparison      `Finding` carries `anchor`, `claimed`, `computed`, `delta`.
 *   held            `redact()` withholds `diverges` at `severity: high` until a
 *                   person releases it, and holding is the default. A finding
 *                   with no review decision recorded against it is held.
 *   answered        `Amendment` is append-only and never edits or deletes the
 *                   finding it answers.
 *
 * The line under the card is the half that does not exist, and it carries two
 * facts now. There is no signed identifier and no endpoint a venue can call, so
 * a venue takes the author's word for it; and an author who dislikes what a run
 * found can decline to hand it over. The second one used to be a whole FAQ
 * answer ("does the venue see my report, or do I"), which was 110 words to say
 * what this section had already set up. It reads harder here, next to the claim
 * it undercuts, than four screens later behind a chevron.
 *
 * **Form: a 2x2.** One wide card carries the section so it stands off the page,
 * and above `two:` the four properties sit in quadrants divided by two
 * hairlines. The four are unordered, and a column of rows would claim a sequence
 * they do not have. Below `two:` they stack, separated by the same hairlines,
 * because two columns of forty characters is not a grid. The rows take no
 * elevation of their own: a shadow under each would be four objects where the
 * section has one.
 *
 * **Every window here is measured from the element that carries it.** `Rise`
 * gives each element its own track, so progress 0 is its own top edge at the
 * fold and the window is a distance in pixels of the viewport it is being read
 * on. No constant in this file can go stale when the copy changes length.
 *
 * Not pinned. Four rows plus a section tag and a line of copy exceed a short
 * viewport, and a pinned section taller than the screen hides its own lower half.
 */

const PROPERTIES: { term: string; detail: string }[] = [
  {
    term: "A permalink",
    detail: "Every check, its verdict, and the evidence under it.",
  },
  {
    term: "Every finding carries its comparison",
    detail: "Anchor, claimed, computed, delta.",
  },
  {
    term: "High-severity divergences wait for a person",
    detail: "They stay off the permalink until someone releases them.",
  },
  {
    term: "An author can answer",
    detail: "An amendment sits under the finding, which stays as written.",
  },
];

/**
 * The quadrants, and the rules between them.
 *
 * Written out per item rather than generated, because the four differ in which
 * two of their edges carry a rule and there is no expression for that which is
 * shorter than saying it. Below `two:` every item but the first takes a rule
 * above it and the grid collapses to the stack it was.
 */
const RULE = "border-[var(--site-line-invert)]";
const QUADRANT = [
  `${RULE} pb-6 two:border-r two:border-b two:pr-10 two:pb-8`,
  `${RULE} border-t pt-6 two:border-t-0 two:border-b two:pt-0 two:pb-8 two:pl-10`,
  `${RULE} border-t pt-6 two:border-t-0 two:border-r two:pr-10 two:pt-8`,
  `${RULE} border-t pt-6 two:border-t-0 two:pt-8 two:pl-10`,
];

/**
 * How far along its own travel each quadrant follows the one before it.
 *
 * The two in a row sit at the same height, so geometry alone would deliver them
 * together; the pair below arrives later without help. 0.03 is enough to read
 * the four in order and short enough that the last one still resolves before its
 * centre reaches the middle of the screen.
 */
const ROW_LEAD = 0.03;

export function Report() {
  return (
    <section id="report" className="site-section scroll-mt-20">
      <Container>
        <SectionTag tag="The report" heading="What a reviewer opens" />

        <Rise
          kind="surface"
          y={12}
          scale={[0.96, 1]}
          lift="card"
          boxClassName="site-stack"
        >
          {/* `elevation="none"` because the shadow is scrubbed on the layer
              above, so the card gains its depth as it lands rather than
              carrying it from the first frame. */}
          <Card tone="dark" elevation="none" className="p-6 two:p-8 three:p-10">
            <dl className="grid two:grid-cols-2">
              {PROPERTIES.map((property, i) => (
                // `dl > div > dt + dd` is the grouping HTML allows, which is
                // what lets the arrival wrap a pair without breaking the list.
                <Rise
                  key={property.term}
                  kind="row"
                  lead={i * ROW_LEAD}
                  y={14}
                  boxClassName={QUADRANT[i]}
                  className="flex flex-col gap-2"
                >
                  <dt
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
                    className="max-w-[46ch]"
                    style={{
                      fontSize: "14px",
                      lineHeight: 1.6,
                      color: "var(--site-muted-invert)",
                    }}
                  >
                    {property.detail}
                  </dd>
                </Rise>
              ))}
            </dl>
          </Card>
        </Rise>

        <Rise kind="row" y={20} boxClassName="mt-10">
          <p
            className="max-w-[60ch]"
            style={{
              fontSize: "clamp(18px, 1.5vw, 20px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.5,
              color: "var(--site-ink)",
            }}
          >
            Every verdict states what it compared and which rule it applied, so a chair who
            disagrees checks the comparison rather than the tool.
          </p>
        </Rise>
      </Container>
    </section>
  );
}
