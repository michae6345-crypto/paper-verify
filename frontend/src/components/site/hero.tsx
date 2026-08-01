import { Container, GhostLink, PrimaryLink, Tag } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";

/**
 * The hero. One claim, one sentence under it, and two ways in.
 *
 * The reference's heading is 44 / 80 / 108px at its three breakpoints, all at
 * -0.06em. That is a curve rather than three decisions, so `site-h1` clamps it
 * and the breakpoints go away.
 *
 * The second control in the capture is an icon with no label, which is a link a
 * screen reader announces as nothing at all. It goes to the BERT report, so it
 * says so.
 */
export function Hero() {
  return (
    <section id="hero" className="pt-[180px] pb-[118px] three:pb-[118px]">
      <Container>
        <div className="flex flex-col items-center gap-9 text-center">
          <Reveal>
            <Tag dot>Built for conference and workshop submissions</Tag>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="site-h1 mx-auto max-w-[1000px] text-balance">
              A verification layer for papers under submission
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="site-body mx-auto max-w-[560px] text-balance">
              residual checks whether the numbers a paper states agree with each other. An author
              runs it before submitting and attaches the report. A reviewer or chair reads it
              instead of redoing the arithmetic by hand.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div
              className="flex flex-wrap items-center justify-center gap-3 p-2"
              style={{ background: "var(--site-card)", borderRadius: "var(--site-radius-pill)" }}
            >
              <PrimaryLink href="/check">Check a paper</PrimaryLink>
              <GhostLink href="/reports/1810.04805">See a finished report</GhostLink>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
