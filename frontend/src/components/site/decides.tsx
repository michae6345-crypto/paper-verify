import { DecidesReasons } from "@/components/site/decides-reasons";
import { MeasuredLedger } from "@/components/site/measured";
import { Container } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * How it decides: the claim, and the two things that back it.
 *
 * The heading is the product's central claim, set in the two-tone form
 * `MOTION_TEARDOWN.md` §2 records: the setup in mid-grey, the punchline at full
 * contrast, same size and weight, nothing moving. The teardown's note on that
 * device is that the contrast does all the work and it survives a screenshot,
 * which for the one line on this page that cannot go unread is the property to
 * want.
 *
 * Under it, two objects and no prose between them:
 *
 *   reasons   the four codes a check declines with. A dark panel.
 *   ledger    the corpus counts, on the quietest surface on the page.
 *
 * The ledger is here rather than in a section of its own because two of its five
 * figures are this heading's evidence: `0 of 4` checks call a model, and `32
 * entries` were declined with a reason. Read anywhere else they are volume; read
 * under the claim they are the proof of it, and the page loses a section break
 * for free.
 *
 * What this section used to carry, and why none of it is missed: three columns
 * of running text decomposing the heading into extract, compute and decline, and
 * a two-column band on where the tool stops and a reviewer starts. The columns
 * restated the heading at length. The band's three checkpoints were already said
 * elsewhere, propose in `checks`, report and contest in `report` and the FAQ, and
 * its venue-intake limit is stated in `demo-cta`.
 *
 * Nothing here is pinned. The dark panel plus the ledger is more than a short
 * viewport holds, and a pinned section taller than the screen puts its own lower
 * half out of reach.
 */

export function Decides() {
  return (
    <section id="decides" className="site-section scroll-mt-20">
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

        <DecidesReasons />
        <MeasuredLedger />
      </Container>
    </section>
  );
}
