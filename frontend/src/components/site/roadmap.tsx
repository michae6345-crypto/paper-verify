import { Card, Container } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What is not built yet.
 *
 * The paragraph at the foot of it is the reason this section is allowed to
 * exist on a page whose central claim is that we do not publish what we cannot
 * support. Four capabilities are named, and immediately under them is a
 * sentence saying that none of them runs and that none of them is counted in
 * any figure above. Without that sentence the section would be four promises
 * dressed as four features.
 */

const ITEMS: { title: string; description: string }[] = [
  {
    title: "Rerun the experiments",
    description:
      "An author submits a container image and the run reproduces the numbers in the tables, rather than only recomputing them from the source.",
  },
  {
    title: "Reports a venue can verify",
    description:
      "A signed report identifier and an endpoint a chair can call, so a venue can confirm a report belongs to the paper in front of it.",
  },
  {
    title: "Claims against tables",
    description:
      "Matching a number stated in the abstract or the body text to the table cell it refers to, and checking that reported variance is consistent.",
  },
  {
    title: "Baselines and submission safety",
    description:
      "Checking a baseline number against the paper it was taken from, and scanning a submission for text written to steer a model that reads it.",
  },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="What's next" heading="On the roadmap, and not built yet" />

        <div className="mt-10 flex flex-col gap-12 three:mt-[60px] three:flex-row three:items-start three:gap-[60px]">
          <Reveal className="three:flex-1">
            <Card tone="dark" className="flex h-full flex-col items-start gap-7 p-10">
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.5,
                  color: "#ffffff",
                }}
              >
                Where this is going
              </h3>
              <ul className="flex w-full flex-col gap-6">
                {ITEMS.map((item) => (
                  <li key={item.title} className="flex flex-col gap-1">
                    <p style={{ fontSize: "16px", lineHeight: 1.7, color: "#ffffff" }}>
                      {item.title}
                    </p>
                    <p
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: "var(--site-muted-invert)",
                      }}
                    >
                      {item.description}
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
              None of this runs yet. It is listed because it is the direction, not because you can
              use it. Everything above this section works today on the corpus in this repository,
              and nothing on the roadmap is counted in those numbers.
            </p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
