"use client";

import { useRef } from "react";

import { Card, Container } from "@/components/site/ui";
import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
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
 *
 * Which is also why the motion runs in the order it does. The card comes up,
 * then the four capabilities in turn, and the paragraph that disowns them lands
 * last, while they are all still on screen. A list of four things that arrives
 * after the reader has read the disclaimer is a different section.
 *
 * The rerun is the one the product is actually aimed at, so it is described at
 * the length that deserves and the paragraph names the reason it is unsolved
 * rather than only the fact that it is unbuilt. A run that is not deterministic
 * cannot produce a verdict under the rule the rest of this page is built on, and
 * a roadmap item that hides its own hard part is a promise.
 */

const ITEMS: { title: string; description: string }[] = [
  {
    title: "Rerun the experiments",
    description:
      "The paper's code runs on hosted GPUs and what it produces is compared against what the paper prints. Recomputing a table says the paper agrees with itself. Running the code says whether the paper agrees with its own experiments.",
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

/** One item's window, and the gap between one item's window and the next. */
const FIRST = 0.2;
const SPACING = 0.05;
const WINDOW = 0.14;

export function Roadmap() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section id="roadmap" ref={section} className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="What's next" heading="On the roadmap, and not built yet" />

        <div className="mt-10 flex flex-col gap-12 three:mt-[60px] three:flex-row three:items-start three:gap-[60px]">
          <Scrub progress={progress} from={0.12} to={0.3} y={40} className="three:flex-1">
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
              {/* The scrub goes inside the item rather than around it: a div
                  between a ul and its li is not a list any more, and the
                  reading order is the thing this section is arguing with. */}
              <ul className="flex w-full flex-col gap-6">
                {ITEMS.map((item, i) => (
                  <li key={item.title}>
                    <Scrub
                      progress={progress}
                      from={FIRST + i * SPACING}
                      to={FIRST + i * SPACING + WINDOW}
                      y={16}
                      className="flex flex-col gap-1"
                    >
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
                    </Scrub>
                  </li>
                ))}
              </ul>
            </Card>
          </Scrub>

          <Scrub progress={progress} from={0.36} to={0.54} y={32} className="three:flex-[2]">
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
              and nothing on the roadmap is counted in those numbers. The rerun is the least
              settled of the four: a training run is not deterministic, and a layer whose whole
              rule is that a verdict is a pure function of its inputs cannot report a seed&rsquo;s
              worth of variance as a divergence. That question is open, which is why this is a
              direction and not a date.
            </p>
          </Scrub>
        </div>
      </Container>
    </section>
  );
}
