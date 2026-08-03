"use client";

import { useRef, type ReactNode } from "react";

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
 * then the four capabilities in turn, and the paragraph that disowns them is not
 * allowed to be the first thing to settle. A list of four things that arrives
 * after the reader has read the disclaimer is a different section.
 *
 * That ordering used to be stated as "the paragraph lands last", and at the
 * `three:` breakpoint it cannot. The card and the paragraph are two columns with
 * their tops level, so the paragraph sits 487px above the fourth capability; by
 * the time that item is at reading height the paragraph is off the top of a
 * 720px screen. The old numbers appeared to satisfy it only because every item
 * was resolving at 78% to 100% opacity before its centre had cleared the fold —
 * the ordering held between two things the reader could not see either of. What
 * is true and is now what the numbers say: the paragraph arrives with the first
 * capability and the lower two continue after it, so the reader cannot finish
 * the list before the disclaimer is there. Below `three:` the layout stacks, the
 * paragraph is last in the flow and lowest on the screen, and the original
 * reading holds exactly.
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
      "The paper's code runs on hosted GPUs and what it produces is compared against what the paper prints. Recomputing a table says the paper agrees with itself. Running the code says whether it agrees with its own experiments.",
  },
  {
    title: "Reports a venue can verify",
    description:
      "A signed identifier and an endpoint a chair can call, so a venue can confirm a report belongs to the paper in front of it.",
  },
  {
    title: "Claims against tables",
    description:
      "Matching a number stated in the abstract to the cell it refers to, and checking that reported variance is consistent.",
  },
  {
    title: "Baselines and submission safety",
    description:
      "Checking a baseline against the paper it came from, and scanning a submission for text written to steer a model that reads it.",
  },
];

/**
 * One item's window, and the gap between one item's window and the next.
 *
 * The section is 1081px tall, so travel at a 720px viewport is 1801px. The four
 * items are 113 to 133px apart and the uniform 0.070 is the average of that
 * read as scroll distance — within 25px of each item's true offset, which is
 * inside the tolerance of a window 438px long.
 *
 * `WINDOW` was 0.14, or 252px of scrolling. Measured in a browser, the four
 * items were at **opacity 0.78, 0.82, 1.00 and 1.00 on the frame their centres
 * first came over the fold**: the last two had finished entirely below the
 * screen and the first two were nearly done. This section had the worst motion
 * on the page and it was not visible from the source, because the constants look
 * no different from the ones in `measured.tsx`, which were fine.
 */
const FIRST = 0.282;
const SPACING = 0.07;
const WINDOW = 0.243;

/** The card holding them, arriving as a surface. 0.24 of 1801px is 432px. */
const CARD_FROM = 0.218;
const CARD_TO = 0.458;

/**
 * The paragraph, on its own travel rather than the section's.
 *
 * Same reasoning as the identical block in `decides.tsx`, and the two sections
 * are built alike so they should not diverge here either. This is the one
 * element whose offset changes with the breakpoint — right-hand column above
 * `three:`, last thing in the section below it — so a fraction of the section
 * can only ever be right for one of the two layouts. Measured against itself it
 * is 437px of scrolling ending just under halfway up the screen at every
 * viewport, and the ordering note above stays true in both: on a phone this is
 * the last thing in the flow and so genuinely the last to settle.
 */
const NOTE_FROM = 0;
const NOTE_TO = 0.52;

/** The paragraph, measured against itself. See `NOTE_FROM` for why. */
function ClosingNote({ children }: { children: ReactNode }) {
  const note = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(note);

  return (
    <div ref={note} className="three:flex-[2]">
      <Scrub progress={progress} from={NOTE_FROM} to={NOTE_TO} y={20}>
        {children}
      </Scrub>
    </div>
  );
}

export function Roadmap() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section id="roadmap" ref={section} className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="What's next" heading="On the roadmap, and not built yet" />

        <div className="mt-10 flex flex-col gap-12 three:mt-[60px] three:flex-row three:items-start three:gap-[60px]">
          <Scrub
            progress={progress}
            from={CARD_FROM}
            to={CARD_TO}
            y={12}
            scale={[0.96, 1]}
            lift="card"
            className="three:flex-1"
          >
            {/* The same elevation as the card in `decides`, because it is the same
                shape of section: one object and the paragraph that argues with it.
                Two sections built alike should not sit at two depths — including
                in how they arrive, so this one is scrubbed the same way, with the
                shadow on the layer above and `elevation="none"` here so there is
                only ever one of them. */}
            <Card
              tone="dark"
              elevation="none"
              className="flex h-full flex-col items-start gap-7 p-10"
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
                      y={14}
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

          <ClosingNote>
            <p
              className="max-w-[60ch]"
              style={{
                fontSize: "clamp(18px, 1.5vw, 20px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.5,
                color: "var(--site-ink)",
              }}
            >
              None of this runs yet, and none of it is counted in the numbers above. The rerun is
              the least settled: a training run is not deterministic, and a layer whose rule is
              that a verdict is a pure function of its inputs cannot report a seed&rsquo;s worth of
              variance as a divergence. That question is open, which is why this is a direction and
              not a date.
            </p>
          </ClosingNote>
        </div>
      </Container>
    </section>
  );
}
