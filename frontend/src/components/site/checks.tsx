import { ChecksGrid, type CardSpec } from "@/components/site/checks-grid";
import { checkFrom, findingFrom } from "@/components/site/corpus.server";
import { Container } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What it checks today. Four, and the count is the count.
 *
 * The first two carry their own title and description out of
 * `src/fixtures/reports/1810.04805.json` rather than out of this file, because
 * those strings are the checker's `display_name` and `description` and they
 * should go stale here the moment they change there. The other two do not
 * appear in any committed report: `dead_links` and `citation_existence` need the
 * network, and the corpus runs without it. Their copy is written here, and the
 * section says as much rather than implying four checks were measured when two
 * were.
 *
 * The evidence card is the BERT finding, every field read from that same file.
 * Nothing on it is typed out here — not the claimed value, not the computed one,
 * not the delta, and not the locator, which reads `column "Average -"` because
 * that is the column header the paper actually prints.
 *
 * This file reads those reports off disk, so it stays a server component and
 * hands the assembled cards to `checks-grid.tsx`, which is the client half and
 * owns the scroll motion. The split is a rendering boundary and nothing more:
 * every string still originates here or in the report.
 */

const BERT = "1810.04805";

const NETWORK_CHECKS = [
  {
    title: "Links resolve",
    description:
      "Every URL printed in the paper is requested, and the ones that no longer resolve are listed.",
  },
  {
    title: "Citations exist",
    description:
      "Every reference in the bibliography is looked up by identifier, never by title containment.",
  },
];

export function Checks() {
  const bold = checkFrom(BERT, "bold_extreme");
  const average = checkFrom(BERT, "row_arithmetic");
  const finding = findingFrom(BERT, "row_arithmetic");

  const cards: CardSpec[] = [];

  if (bold) {
    cards.push({ title: bold.display_name ?? "", description: bold.description ?? "" });
  }

  if (average) {
    cards.push({
      title: average.display_name ?? "",
      description: average.description ?? "",
      evidence: finding
        ? {
            paperId: BERT,
            paperName: "BERT",
            locator: finding.anchor?.human_locator ?? "",
            claimed: finding.claimed ?? "",
            computed: finding.computed ?? "",
            delta: finding.delta ?? "",
            verdict: average.verdict,
          }
        : undefined,
    });
  }

  cards.push(...NETWORK_CHECKS);

  return (
    <section id="checks" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="The checks" heading="What it checks today" />

        <ChecksGrid cards={cards}>
          <p className="site-body mt-8 max-w-[70ch]">
            The first two need nothing but the paper&rsquo;s own source, and every number quoted on
            this page comes from running them over the corpus with the network switched off. The
            last two request URLs and look up identifiers, so they are excluded from those figures
            rather than quietly folded into them.
          </p>
        </ChecksGrid>
      </Container>
    </section>
  );
}
