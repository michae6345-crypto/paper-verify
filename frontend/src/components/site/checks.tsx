import { ChecksGrid, type CardSpec } from "@/components/site/checks-grid";
import { checkFrom, findingFrom } from "@/components/site/corpus.server";
import { Container, Mono } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What it checks today. Four, and the count is the count.
 *
 * The four are two families, and the section says so before the grid rather than
 * leaving a reader to infer it from four cards in a 2x2. Two of them read the
 * paper against itself and two read it against the world outside it, and the
 * lede exists because the page used to present the arithmetic as the product.
 * It is one family of two, and the closing note says which part of it is
 * actually hard.
 *
 * The first two carry their own title and description out of
 * `src/fixtures/reports/1810.04805.json` rather than out of this file, because
 * those strings are the checker's `display_name` and `description` and they
 * should go stale here the moment they change there. The other two do not
 * appear in any committed report: `dead_links` and `citation_existence` need the
 * network, and the corpus runs without it. Their strings are copied verbatim
 * from `DISPLAY_NAME` and `DESCRIPTION` in `backend/pv/checks/links.py` and
 * `backend/pv/checks/citations.py`, so a reader who meets one of these in a
 * report meets the same words. Copied, not bound: change them there and they
 * must be changed here.
 *
 * The evidence card is the BERT finding, every field read from that same file.
 * Nothing on it is typed out here — not the claimed value, not the computed one,
 * not the delta, and not the locator, which reads `column "Average -"` because
 * that is the column header the paper actually prints.
 *
 * The order is not a ranking, and it is load-bearing for a different reason: the
 * evidence panel's rows open at 0.2 of the grid's travel, which is after the
 * second card's window and before the third's. Moving the card that carries them
 * puts six rows on screen before the card holding them has arrived.
 *
 * This file reads those reports off disk, so it stays a server component and
 * hands the assembled cards to `checks-grid.tsx`, which is the client half and
 * owns the scroll motion. The split is a rendering boundary and nothing more:
 * every string still originates here or in the report.
 */

const BERT = "1810.04805";

const NETWORK_CHECKS = [
  {
    title: "Dead links",
    description:
      "Requests every URL in the paper and reports the ones the server says are gone.",
  },
  {
    title: "Citation existence",
    description:
      "Looks up each reference in Crossref and OpenAlex and reports confirmed retractions.",
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

        <p className="site-body mx-auto mt-6 max-w-[58ch] text-center">
          Four checks, in two families. Two read the paper against itself. Two read it against the
          world outside it.
        </p>

        <ChecksGrid cards={cards}>
          <p className="site-body mt-8 max-w-[68ch]">
            The arithmetic is the smallest part of this. A false finding comes from misreading the
            source, not from a wrong sum: reading <Mono>86.7/85.9</Mono> as one number produced five
            of them on a single table. The work is deciding what a cell says, and declining when
            that cannot be decided. The corpus figures below come from the two checks that need no
            network, not from all four.
          </p>
        </ChecksGrid>
      </Container>
    </section>
  );
}
