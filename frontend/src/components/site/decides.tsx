import { Card, Container } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
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

export function Decides() {
  return (
    <section id="decides" className="scroll-mt-20 py-14 three:pt-[120px] three:pb-[160px]">
      <Container>
        <SectionTag tag="How it decides" heading="A verdict is a pure function of its inputs" />

        <div className="mt-10 flex flex-col gap-12 three:mt-[60px] three:flex-row three:items-start three:gap-[60px]">
          <Reveal className="three:flex-1">
            <Card
              tone="dark"
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
                {REASONS.map((reason) => (
                  <li key={reason.code} className="flex flex-col gap-1">
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
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>

          <Reveal delay={0.08} className="three:flex-[2]">
            <p
              className="max-w-[60ch]"
              style={{
                fontSize: "clamp(18px, 1.5vw, 20px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.5,
                color: "var(--site-ink)",
              }}
            >
              The same paper checked twice gives the same answer. A language model never produces a
              verdict. Models extract structure, and every verdict is computed by deterministic
              Python from that structure. A check that cannot be made deterministic returns
              unverifiable with a stated reason rather than a guess. A run where much of the paper
              comes back unverifiable is a success, not a shortfall.
            </p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
