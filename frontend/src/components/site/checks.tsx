import { ChecksDirection } from "@/components/site/checks-direction";
import { ChecksGrid, type CardSpec } from "@/components/site/checks-grid";
import { checkFrom, findingFrom } from "@/components/site/corpus.server";
import { Container, Mono } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What runs on a paper today, and what is designed to run next.
 *
 * The first two cards carry their own title and description out of
 * `src/fixtures/reports/1810.04805.json`, because those strings are the
 * checker's `display_name` and `description` and they should go stale here the
 * moment they change there.
 *
 * The third card is the two checks that ask whether the things a paper points at
 * exist: `dead_links` requests every URL, `citation_existence` looks up every
 * reference. It appears in no committed report, because both need the network
 * and the corpus runs without it, so its sentence is the two `DESCRIPTION`
 * constants in `backend/pv/checks/links.py` and `backend/pv/checks/citations.py`
 * joined. Copied, not bound: change them there and they must be changed here.
 *
 * The evidence card is the BERT finding, every field read from that same file.
 * Nothing on it is typed out here, not the claimed value, not the computed one,
 * not the delta, and not the locator, which reads `column "Average -"` because
 * that is the column header the paper actually prints.
 *
 * The evidence is also what raises its card off the page and gives it the tall
 * column. `checks-grid.tsx` reads the presence of an `evidence` field rather
 * than a position, so both follow the finding wherever the finding goes, but
 * there should stay exactly one of them. Two lead cards in a group is a group
 * with no foreground.
 *
 * `checks-direction.tsx` is the second band, and it is written so that it cannot
 * be read as capability: nothing in it is in the present tense, the band heading
 * says none of it runs, and every row carries a `not built` marker.
 *
 * This file reads the reports off disk, so it stays a server component and hands
 * the assembled cards to the two client halves that own the scroll motion.
 */

const BERT = "1810.04805";

/**
 * The one card not bound to a committed report. Both halves are their checker's
 * own `DESCRIPTION`, joined by "then" rather than rewritten, because the point
 * of copying them is that the words match what a report prints.
 */
const POINTS_AT: CardSpec = {
  title: "What the paper points at",
  description:
    "Requests every URL in the paper and reports the ones the server says are gone, then looks up " +
    "each reference in Crossref and OpenAlex and reports confirmed retractions.",
  checkers: ["dead_links", "citation_existence"],
};

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

  cards.push(POINTS_AT);

  return (
    <section id="checks" className="site-section scroll-mt-20">
      <Container>
        <SectionTag tag="The checks" heading="What runs on a paper today" />

        <ChecksGrid cards={cards}>
          <p className="site-body max-w-[68ch]">
            False findings come from misreading the source. Reading <Mono>86.7/85.9</Mono> as one
            number produced five of them on one table.
          </p>
        </ChecksGrid>

        <ChecksDirection />
      </Container>
    </section>
  );
}
