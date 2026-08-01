import { Card, Container } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SectionTag } from "@/components/site/section-tag";

/**
 * How a run proceeds.
 *
 * The five names are `RunStage` in `backend/pv/orchestrator.py`, and they are
 * the five a run actually passes through. The enum holds five more — `queued`,
 * `awaiting_artifact`, `planning`, and the three terminal states — which are
 * either a state a run waits in or the state it ends in, not a stage it moves
 * through. Listing those here would be padding.
 *
 * The reference scatters the cards vertically by 62 / 0 / 64 / 12 / 48px, and
 * that is kept: a straight row of five equal cards reads as a table of contents,
 * and this is meant to read as a sequence. The scatter is on the `three:`
 * breakpoint only, because below it the cards stack and an offset would just be
 * five cards at five wrong heights.
 */

const STAGES: { name: string; description: string; stagger: string }[] = [
  {
    name: "resolving",
    description: "Find the paper and fetch its source.",
    stagger: "three:mt-[62px]",
  },
  {
    name: "extracting",
    description: "Resolve the multi-file LaTeX and build the macro table.",
    stagger: "three:mt-0",
  },
  {
    name: "mining",
    description: "Turn every table cell, link and citation into a checkable claim.",
    stagger: "three:mt-[64px]",
  },
  {
    name: "checking",
    description: "Recompute each claim without deciding anything.",
    stagger: "three:mt-[12px]",
  },
  {
    name: "adjudicating",
    description: "Apply the tolerance policy and assign a verdict.",
    stagger: "three:mt-[48px]",
  },
];

export function Process() {
  return (
    <section id="process" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="How a run proceeds" heading="The stages a run moves through" />

        <ol className="mt-10 flex flex-col gap-14 three:mt-[60px] three:flex-row three:items-start three:gap-4">
          {STAGES.map((stage, i) => (
            <li key={stage.name} className={`${stage.stagger} three:min-w-0 three:flex-1`}>
              <Reveal delay={i * 0.05}>
                <Card className="flex h-full flex-col justify-between gap-10 p-8 three:min-h-[454px]">
                  <p
                    style={{
                      fontSize: "clamp(44px, 5vw, 72px)",
                      fontWeight: 300,
                      letterSpacing: "-0.06em",
                      lineHeight: 1.25,
                      color: "var(--site-ink)",
                    }}
                  >
                    {i + 1}
                  </p>
                  <div className="flex flex-col items-center gap-1 text-center">
                    <h3
                      className="site-mono"
                      style={{
                        fontSize: "clamp(18px, 1.6vw, 24px)",
                        lineHeight: 1.6,
                        color: "var(--site-ink)",
                      }}
                    >
                      {stage.name}
                    </h3>
                    <p className="site-body">{stage.description}</p>
                  </div>
                </Card>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
