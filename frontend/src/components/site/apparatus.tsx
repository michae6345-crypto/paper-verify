import {
  ApparatusPanels,
  type ApparatusCell,
  type ApparatusEntry,
  type ApparatusRow,
} from "@/components/site/apparatus-panels";
import { checkFrom, findingFrom } from "@/components/site/corpus.server";
import { getReport } from "@/lib/reports";
import { VERDICT_RANK } from "@/lib/verdict";
import type { Cell, Verdict } from "@/types/run-report";

/**
 * The signature scroll moment: one table, read twice.
 *
 * `docs/MOTION_TEARDOWN.md` §3 describes a near-black panel that a second panel
 * of identical geometry slides up over. The teardown's own mapping section says
 * what ours has to be, and it is the reason that reference works for us at all:
 * theirs is a mess-to-clean metaphor, ours is literal. Panel A is a paper's
 * table as it prints. Panel B is the same cells with every mark the run made
 * against them. Same geometry, same grid, two readings of one object, which is
 * what an apparatus criticus is and what `DESIGN_PLAN.md` committed to.
 *
 * This file is the server half. It reads the committed report off disk, derives
 * the marks, and hands a plain object to `apparatus-panels.tsx`, which owns the
 * motion and can therefore be a client component. Nothing about the table or its
 * verdicts is decided in that file; every string it renders arrives from here,
 * and everything here comes out of `src/fixtures/reports/1810.04805.json`.
 *
 * ---
 *
 * **Why this table.** `tab:glue_official` is BERT's GLUE test results, and it is
 * the one table in the corpus that carries a real finding at a real coordinate:
 * `row_arithmetic` records `71.0` claimed against `70.944` computed at
 * `tab:glue_official/r3/c9`, delta `+0.056`, verdict `within tolerance`. It is
 * also the table that produced this repository's canonical bug: reading
 * `86.7/85.9` as a single number generated five false `diverges`. Five is
 * exactly the number of two-valued cells in it, counted below rather than typed.
 *
 * ---
 *
 * **The derivation, which is the part that has to be right.**
 *
 * A fabricated number on this page would end the product's only argument, and a
 * fabricated *verdict* would be worse: this page is published about named
 * researchers. So each body cell gets exactly one of three states, by three
 * rules applied in order, and no rule invents a judgement the report does not
 * already contain:
 *
 *   1. A finding is anchored to the cell. Take that check's verdict and the
 *      finding's own siglum. One cell in this table qualifies: r3/c9.
 *
 *   2. The cell is bold, is not a header, holds exactly one parsed value, and
 *      the report's `bold_extreme` check returned `matches` with no findings at
 *      all. Then `matches`. This is the check's own semantics rather than a
 *      guess: "bolded value is the best in its block" is a universal over the
 *      bolded cells, and a paper-level `matches` with an empty findings array is
 *      the statement that none of them was contradicted. Eight cells qualify.
 *
 *   3. Everything else is `not_attempted`, which the UI renders as **not
 *      checked**. Thirty-six cells. This is not a failure state (§7 and
 *      `CLAUDE.md`); it is the answer to "which checks made a claim about this
 *      cell", and the answer is none.
 *
 * The exclusion in rule 2 is the whole of `CLAUDE.md`'s recurring-bug warning,
 * written as a condition. `86.7/85.9` parses to `values: [86.7, 85.9]` and
 * `value: null`. A checker cannot compare it against a column as one number, so
 * it falls to rule 3 and says nothing. It would have been easy to let it inherit
 * `matches` from the bolded row it sits in, and that is precisely the lossy read
 * that produces a confident accusation.
 *
 * Things considered and rejected:
 *
 * - **Recomputing the checks here in TypeScript.** Tempting, and wrong twice
 *   over. `CLAUDE.md` puts adjudication in deterministic Python and nowhere
 *   else, so a second implementation on the marketing page is a second source of
 *   truth for verdicts. It also would not work: every column in this table
 *   carries `direction: "unknown"`, so an honest reimplementation would return
 *   `metric_direction_unknown` for all forty-five cells and the panel would say
 *   nothing at all. We cite the run; we do not re-run it.
 *
 * - **Marking the two-valued cells `unverifiable`.** Defensible, since declining
 *   is always the safe direction, but the report contains no such reason code
 *   for them, and `not checked` is the smaller and truer claim: no check in this
 *   report addressed that cell. The two-value fact is stated in the panel foot
 *   instead, where it is a fact about the source rather than a verdict.
 *
 * - **Using `1706.03762`.** The Transformer paper's `row_arithmetic` is
 *   `not_attempted` with `no_applicable_claims`, so its tables carry no anchored
 *   finding at all. It would have made a panel with nothing to point at.
 *
 * One deliberate imprecision, recorded so nobody has to rediscover it: bold in
 * Panel A comes from the parse's `is_bold`/`bold_source`, not from a rendering
 * of the published PDF. The header cell `Average` carries `bold_source: "bf"`,
 * which is a `\bf` switch the parser resolved. Rendering the parse faithfully is
 * the honest option available to us; we do not have the typeset page.
 */

/** BERT. The only paper in the corpus with a finding anchored to a table cell. */
const PAPER = "1810.04805";
const TABLE = "tab:glue_official";

/** A cell's coordinate in the form an `Anchor.dom_id` uses. */
function domId(label: string, cell: Cell): string {
  return `${label}/r${cell.row}/c${cell.col}`;
}

/** The caption up to its first full stop, which is the sentence that names the table. */
function firstSentence(caption: string): string {
  const [head] = caption.split(". ");
  return head.endsWith(".") ? head : `${head}.`;
}

export function Apparatus() {
  const report = getReport(PAPER);
  const table = report?.tables?.find((t) => t.label === TABLE);
  const average = checkFrom(PAPER, "row_arithmetic");
  const bold = checkFrom(PAPER, "bold_extreme");
  const finding = findingFrom(PAPER, "row_arithmetic");

  // The section is bound to one table in one committed report. If the corpus
  // ever stops carrying it, the page loses a section rather than rendering an
  // empty panel or, far worse, a placeholder number.
  if (!report || !table || !table.cells?.length) return null;

  // Rule 2's precondition, evaluated once. A single `matches` with an empty
  // findings array is the only shape that licenses attributing the check to the
  // individual cells it ranged over.
  const boldClean = bold?.verdict === "matches" && (bold.findings?.length ?? 0) === 0;

  // Rule 1's index. Built across every check rather than just the two we know
  // are present, so a corpus that later carries a `diverges` on this table marks
  // it without this file changing.
  const anchored = new Map<string, { verdict: Verdict; siglum: string }>();
  for (const check of report.checks ?? []) {
    for (const f of check.findings ?? []) {
      if (!f.anchor?.dom_id) continue;
      anchored.set(f.anchor.dom_id, { verdict: check.verdict, siglum: f.siglum ?? "" });
    }
  }

  const resolve = (cell: Cell): { verdict: Verdict | null; siglum: string | null } => {
    if (cell.is_header || cell.col === 0) return { verdict: null, siglum: null };

    const hit = anchored.get(domId(TABLE, cell));
    if (hit) return { verdict: hit.verdict, siglum: hit.siglum };

    // The exclusion that keeps `86.7/85.9` out of rule 2.
    const single = (cell.values ?? []).length === 1;
    if (cell.is_bold && single && boldClean) return { verdict: "matches", siglum: null };

    return { verdict: "not_attempted", siglum: null };
  };

  const rowsByIndex = new Map<number, Cell[]>();
  for (const cell of table.cells) {
    const row = rowsByIndex.get(cell.row) ?? [];
    row.push(cell);
    rowsByIndex.set(cell.row, row);
  }

  const ordered = [...rowsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) => cells.sort((a, b) => a.col - b.col));

  const head: ApparatusCell[][] = [];
  const body: ApparatusRow[] = [];
  const counts = new Map<Verdict, number>();
  let multiValueCells = 0;
  let previousBlock: number | null = null;

  for (const cells of ordered) {
    const isHead = cells.every((c) => c.is_header);
    const marked = cells.map((cell) => {
      const { verdict, siglum } = resolve(cell);
      if (verdict) counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
      if (!cell.is_header && (cell.values ?? []).length > 1) multiValueCells += 1;
      return { text: cell.text, bold: cell.is_bold ?? false, verdict, siglum };
    });

    if (isHead) {
      head.push(marked);
      continue;
    }

    const block = cells[0]?.block ?? 0;
    body.push({ ruleAbove: previousBlock === null || block !== previousBlock, cells: marked });
    previousBlock = block;
  }

  // The column the average check reads. Taken from the finding's own anchor
  // rather than by looking for a header containing the word "average", which is
  // the `all` / "All layers" mistake on ELMo, made once already.
  const readColumn = finding?.anchor?.col ?? null;

  const tally = [...counts.entries()]
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]);

  const entry: ApparatusEntry | null =
    finding && average
      ? {
          siglum: finding.siglum ?? "",
          domId: finding.anchor?.dom_id ?? "",
          claimed: finding.claimed ?? "",
          computed: finding.computed ?? "",
          delta: finding.delta ?? "",
          verdict: average.verdict,
        }
      : null;

  return (
    <ApparatusPanels
      data={{
        paperId: report.arxiv_id,
        tableLabel: TABLE,
        caption: firstSentence(table.caption ?? ""),
        readChecker: average?.checker ?? "row_arithmetic",
        readColumn,
        head,
        body,
        entry,
        tally,
        multiValueCells,
      }}
    />
  );
}
