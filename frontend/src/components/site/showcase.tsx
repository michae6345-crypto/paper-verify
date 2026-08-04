import { ShowcaseCards, type ShowcaseItem } from "@/components/site/showcase-cards";
import { realReports } from "@/components/site/corpus.server";
import { CELLS, PAPERS, TABLES } from "@/components/site/corpus";
import { getReport } from "@/lib/reports";
import { SectionTag } from "@/components/site/section-tag";
import { Container } from "@/components/site/ui";
import type { Table } from "@/types/run-report";

/**
 * Four real tables, drawn as the parser sees them.
 *
 * The Framer template this page came from carried a row of image cards partway
 * down, and they were the best-looking thing on it. What they held was stock
 * product photography, which is exactly the kind of content this product cannot
 * ship: a decorative image of work nobody did, on the marketing page of a tool
 * whose entire claim is that it publishes nothing it cannot support. The row is
 * worth keeping. The photographs are not.
 *
 * So the cards hold the only imagery this site is entitled to — its own output.
 * Each plate is one real table from `fixtures/papers/`, drawn from the parsed
 * structure in the committed run report: one mark per cell, a rule wherever the
 * block index changes, the genuinely bold cells in ink, the spacer column drawn
 * as the gap it is, and nothing at all where a cell is empty, because an empty
 * cell means "not reported" and never zero.
 *
 * That turns "some nice image cards" into "the thing the product actually
 * produces", which is both honest and a better argument than a photograph would
 * have been. A reader who looks at four of these has seen four papers' tables
 * disagree in shape, which is the whole reason the parser is hard.
 *
 * ---
 *
 * **This file is the server half.** It reads the committed reports off disk,
 * derives every figure on every card, and hands plain objects to
 * `showcase-cards.tsx`, which owns the motion and can therefore be a client
 * component. That split is `checks.tsx` / `checks-grid.tsx`'s, and
 * `apparatus.tsx` / `apparatus-panels.tsx`'s, and it is the reason nothing in
 * the client file decides anything about a paper.
 *
 * Not one number below is typed. The corpus totals come from `corpus.ts`, which
 * exists so that a checker change moves this page with it. The per-card figures
 * are counted out of the report's own parsed cells, here, at build time. A
 * `104 cells` written into JSX would be a claim with no provenance and it would
 * go stale silently, which is the failure `measured.tsx` was built to avoid.
 *
 * ---
 *
 * **Which four tables, and why these.**
 *
 * One per paper, chosen for a different structural story each time rather than
 * by a rule. A rule was tried first and does not work: "most cells" picks CLIP's
 * 2,010-cell linear-probe table, whose plate is a grey mist at card size, and
 * "most bold" picks the same table the hero windows already carry. The choice of
 * *which* real table to show is editorial. Every mark drawn inside it is not.
 *
 *   tab:arch          ResNet, eight rule-delimited blocks, and the only table
 *                     here carrying real parse warnings: two of its rows cover
 *                     six columns against a spec that declares seven.
 *   tab:wmt-results   The Transformer's, and the table `CLAUDE.md` is mostly
 *                     about. Four blocks, four bold cells across two of them,
 *                     and the empty spacer column at index 3 that makes column
 *                     index and cell index part company.
 *   tab:squad_results BERT's, four blocks and eight bold cells, with the bold
 *                     concentrated in the last block rather than spread.
 *   table:retrieval   CLIP's, thirteen bold cells across fourteen columns. The
 *                     widest table in the corpus that still reads at card size.
 *
 * ---
 *
 * **Why this section is the dark one.** The page runs light for four sections
 * and then light for four more, and a reader scrolling through them stops seeing
 * the section boundary at all. This is the one section whose content asks for
 * the inversion rather than merely tolerating it: four white plates on a near
 * black field are a gallery wall, and the plates are the only images the site
 * has. On the page field they were four white cards on grey, which is the same
 * object every other section already puts there.
 *
 * `--site-deep` rather than `--field-deep`, because #0d0d0d is the apparatus's
 * instrument panel and that colour is doing a specific job two sections later.
 * A second near-black would make the two read as the same surface.
 *
 * The header is ranged left with the corpus line beside it, which is
 * `MOTION_TEARDOWN.md` §5's density pattern and the arrangement `apparatus.tsx`
 * uses inside its pin. `process.tsx` immediately above keeps the centred header,
 * so the two sections differ in field, in alignment and in what they hold.
 *
 * ---
 *
 * `tab:glue_official` is deliberately not among them. It is BERT's GLUE table,
 * it carries the corpus's one real finding, and `apparatus.tsx` already builds
 * the page's signature scroll moment out of it. A third appearance would read as
 * the corpus having one table in it.
 *
 * Regenerate the plates from the repo root:
 *
 *     python fixtures/make_plates.py
 *
 * The plates and this file share a table label, and `plateFor` throws at build
 * time if a label stops resolving — so a plate that goes stale fails the build
 * rather than shipping a picture of a table that is no longer there.
 */

/**
 * The four, as identifiers only. Everything else about them is read.
 *
 * `note` is the one editorial line per card: what this particular table does to
 * a parser. It names structure, never a verdict — none of these four cards makes
 * a claim about whether a paper is right, and the vocabulary is kept clear of
 * `matches`, `within tolerance`, `diverges` and `unverifiable` for that reason.
 * The verdict strip underneath is where the run's own answers go.
 *
 * Each note is prose and so cannot be derived, which makes it the one thing on
 * this card that could be wrong while everything around it is right. Two of the
 * four were wrong when first written — `table:retrieval`'s bold sits in two of
 * its three blocks rather than all three, and `tab:wmt-results`'s spacer column
 * is a column and therefore not "between" two blocks, which are row groups.
 * Both were caught by checking rather than by reading. Check them again after
 * any change here, from the repo root:
 *
 *     python - <<'PY'
 *     import json
 *     for rid, label in [("1512.03385","tab:arch"), ("1706.03762","tab:wmt-results"),
 *                        ("1810.04805","tab:squad_results"), ("2103.00020","table:retrieval")]:
 *         d = json.load(open(f'frontend/src/fixtures/reports/{rid}.json', encoding='utf8'))
 *         t = [x for x in d['tables'] if x.get('label') == label and not x.get('is_nested')][0]
 *         cells = t['cells']
 *         bold = [c for c in cells if c['is_bold']]
 *         spacer = [c for c in range(t['n_cols'])
 *                   if all(not (x['text'] or '').strip() for x in cells if x['col'] == c)]
 *         print(label, 'rows', t['n_rows'], 'cols', t['n_cols'], 'cells', len(cells),
 *               'blocks', sorted({c['block'] for c in cells}),
 *               'bold', len(bold), 'in', sorted({c['block'] for c in bold}),
 *               'spacer', spacer, t.get('parse_warnings'))
 *     PY
 */
const CHOSEN = [
  {
    arxivId: "1512.03385",
    label: "tab:arch",
    plate: "/assets/plate-resnet-arch.svg",
    note: "Eight blocks. Two rows are a column short of the spec.",
  },
  {
    arxivId: "1706.03762",
    label: "tab:wmt-results",
    plate: "/assets/plate-transformer-wmt.svg",
    note: "An empty spacer column, so column index and cell index part company.",
  },
  {
    arxivId: "1810.04805",
    label: "tab:squad_results",
    plate: "/assets/plate-bert-squad.svg",
    note: "Every bold value sits in the last of four blocks.",
  },
  {
    arxivId: "2103.00020",
    label: "table:retrieval",
    plate: "/assets/plate-clip-retrieval.svg",
    note: "Thirteen bold values across fourteen columns.",
  },
] as const;

/**
 * The chosen table out of a report, or a build failure.
 *
 * Throwing is deliberate. If a label stops resolving — the fixture is
 * regenerated, a table is relabelled, `is_nested` starts catching one — the
 * alternative to throwing is a card whose plate shows one table and whose
 * figures count another. That is precisely `CLAUDE.md`'s recurring bug: a lossy
 * read that silently produces a confident statement. A build that stops is the
 * cheap failure.
 */
function plateFor(arxivId: string, label: string): Table {
  const report = getReport(arxivId);
  const table = (report?.tables ?? []).find((t) => t.label === label && !t.is_nested);
  if (!table) {
    throw new Error(
      `showcase: ${arxivId} has no non-nested table labelled ${label}. ` +
        `The plate in public/assets was generated from one, so either the fixture ` +
        `changed or the label did. Regenerate the plates and update CHOSEN.`,
    );
  }
  return table;
}

export function Showcase() {
  const reports = new Map(realReports().map((r) => [r.arxiv_id, r]));

  const items: ShowcaseItem[] = CHOSEN.map((choice) => {
    const report = reports.get(choice.arxivId);
    if (!report) throw new Error(`showcase: no committed report for ${choice.arxivId}`);

    const table = plateFor(choice.arxivId, choice.label);
    const cells = table.cells ?? [];

    return {
      arxivId: report.arxiv_id,
      title: report.title,
      href: `/reports/${report.arxiv_id}`,
      label: choice.label,
      plate: choice.plate,
      note: choice.note,
      // Counted here, from the report's own parsed cells. `n_rows` and `n_cols`
      // are the parser's, and the rest are derived the same way the plate is
      // drawn, so the picture and the caption cannot disagree.
      rows: table.n_rows ?? 0,
      columns: table.n_cols ?? 0,
      cells: cells.length,
      blocks: new Set(cells.map((c) => c.block)).size,
      bold: cells.filter((c) => c.is_bold).length,
      tablesParsed: report.tables_parsed,
      verdicts: report.checks.map((c) => c.verdict),
    };
  });

  return (
    <section
      id="showcase"
      className="scroll-mt-20 py-14 three:py-[120px]"
      style={{ background: "var(--site-deep)" }}
    >
      <Container>
        <SectionTag
          tag="What it reads"
          heading="Four tables, as the parser sees them"
          align="start"
          tone="dark"
          aside={
            <p className="site-body" style={{ color: "var(--site-muted-invert)" }}>
              {/* The explicit `{" "}` after a count is load-bearing. A text chunk
                  that spans lines has the leading whitespace of each line
                  trimmed, so ` cells.` written across the line break renders as
                  `7,014cells`. Keeping the unit on one line beside its
                  expression preserves it. */}
              Every mark is one real cell: {PAPERS} papers, {TABLES} tables,{" "}
              {CELLS.toLocaleString("en-GB")} cells. A gap is a cell the paper left empty.
            </p>
          }
        />

        <ShowcaseCards items={items} />
      </Container>
    </section>
  );
}
