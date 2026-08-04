import { DecidesHandoff } from "@/components/site/decides-handoff";
import { DecidesReasons } from "@/components/site/decides-reasons";
import { DecidesRule } from "@/components/site/decides-rule";
import { Container } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * How it decides, in four movements.
 *
 * This section used to be one dark card of reason codes with the product's
 * central claim set beside it as a caption, under the heading "A verdict is a
 * pure function of its inputs". Three things were wrong with that and only one
 * of them was the heading.
 *
 * The heading was a property of the implementation stated as a slogan. It is
 * true, and it says nothing a reader can act on: a pure function of what, and
 * why does that matter to somebody deciding whether to trust a report. The claim
 * underneath it is the one that matters and is the one this whole product is
 * built to be able to make, so the claim is the heading now.
 *
 * It is set in the two-tone form `MOTION_TEARDOWN.md` §2 records: the setup in
 * mid-grey, the punchline at full contrast, same size and weight, nothing
 * moving. The teardown's note on that device is that the contrast does all the
 * work and it survives a screenshot, which for the one line on this page that
 * cannot be allowed to go unread is the right property to want.
 *
 * The paragraph that used to sit in the right-hand column is gone as a
 * paragraph. Its three sentences were the three things that happen to a claim,
 * and they are `decides-rule.tsx` now: three columns of running text, one per
 * stage, on the page field with a drawn hairline between them.
 *
 * The four movements, and why they are in this order:
 *
 *   rule      what produces a verdict. Three columns of text, no surface.
 *   reasons   what happens when it cannot. A dark panel across the full measure.
 *   handoff   who picks up what is left. Plain type in two unequal columns.
 *
 * Each is a different plane and a different setting, so a reader scrolling
 * through does not meet the same object four times. The order is an argument:
 * the rule produces the refusal, the refusal produces the reviewer's half of the
 * job, and none of the three stands up stated on its own.
 *
 * Nothing here is pinned. The three bands together are several screens tall, and
 * a pinned section whose contents exceed the screen puts its own lower half out
 * of reach.
 */

export function Decides() {
  return (
    <section id="decides" className="site-section scroll-mt-20 three:pb-[160px]">
      <Container>
        <SectionTag
          tag="How it decides"
          heading={
            <>
              <span className="block" style={{ color: "var(--site-muted)" }}>
                No model decides.
              </span>
              <span className="block">Python does.</span>
            </>
          }
        />

        <DecidesRule />
        <DecidesReasons />
        <DecidesHandoff />
      </Container>
    </section>
  );
}
