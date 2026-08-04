import { ChecksDirection } from "@/components/site/checks-direction";
import { ChecksGrid, type CardSpec } from "@/components/site/checks-grid";
import { checkFrom, findingFrom } from "@/components/site/corpus.server";
import { Container, Mono } from "@/components/site/ui";
import { SectionTag } from "@/components/site/section-tag";

/**
 * What runs on a paper today, and what it is designed to run next.
 *
 * **The taxonomy is gone.** This section was headed "Four checks, in two
 * families" and laid out as a 2x2 to prove it. Both were a shape put on the work
 * from outside: nobody reading a report cares which family a check belongs to,
 * the count is an accident of what happened to be finished, and a heading that
 * announces a count ages the moment a fifth check lands. The section now says
 * what runs and shows it.
 *
 * **Dead links and citation existence are one card.** They ask the same
 * question, which is whether the things this paper points at exist:
 * `dead_links` requests every URL in the paper, `citation_existence` looks up
 * every reference in Crossref and OpenAlex. Two cards said it twice and made the
 * grid look like a taxonomy again. The merged card names both checkers so a
 * reader who meets either at the top of a report can find it here.
 *
 * The first two cards carry their own title and description out of
 * `src/fixtures/reports/1810.04805.json` rather than out of this file, because
 * those strings are the checker's `display_name` and `description` and they
 * should go stale here the moment they change there. The merged card does not
 * appear in any committed report: `dead_links` and `citation_existence` need the
 * network, and the corpus runs without it. Its sentence is the two `DESCRIPTION`
 * constants in `backend/pv/checks/links.py` and `backend/pv/checks/citations.py`
 * joined, so a reader who meets one of these in a report meets the same words.
 * Copied, not bound: change them there and they must be changed here.
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
 * **The second band is the direction, and it is written so it cannot be read as
 * capability.** The page used to carry a roadmap section at the foot whose
 * closing paragraph disowned everything in it; that section is being removed, so
 * `checks-direction.tsx` carries the disclaiming itself, in the band heading, on
 * every row, and in the closing paragraph. Nothing in it is described in the
 * present tense.
 *
 * This file reads the reports off disk, so it stays a server component and hands
 * the assembled cards to the two client halves that own the scroll motion. The
 * split is a rendering boundary and nothing more: every string still originates
 * here or in the report.
 */

const BERT = "1810.04805";

/**
 * The one card not bound to a committed report.
 *
 * Both halves are their checker's own `DESCRIPTION`, joined by "then" rather
 * than rewritten, because the point of copying them is that the words match what
 * a report prints.
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
            A false finding comes from misreading the source, not from a wrong sum: reading{" "}
            <Mono>86.7/85.9</Mono> as one number produced five of them on one table. Every corpus
            figure on this page comes from the two checks that read nothing but the source.
          </p>
        </ChecksGrid>

        <ChecksDirection />
      </Container>
    </section>
  );
}
