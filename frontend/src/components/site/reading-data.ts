import { listReports } from "@/lib/reports";
import type { Verdict } from "@/types/run-report";

/**
 * The one row the signature scroll moment is built on, read out of the corpus at
 * build time. Server-side only.
 *
 * Row 3 of BERT's GLUE table, `tab:glue_official` in `1810.04805`. It was chosen
 * because it carries the corpus's only real finding *and* the codebase's most
 * expensive lesson in the same nine numbers: the cell headed `MNLI-(m/mm)` reads
 * `76.4/76.1`, which is two results and not one. Reading it as a single number
 * produced five false divergences on this table before anyone caught it, and the
 * resolved panel says `2` over that cell for exactly that reason.
 *
 * Nothing here is typed out. If the parser's reading of that row changes, this
 * changes with it.
 */

const PAPER = "1810.04805";
const TABLE = "tab:glue_official";
const ROW = 3;

export type ReadingCell = {
  /** The column header as the paper prints it. */
  header: string;
  /** The cell as the paper prints it. */
  text: string;
  /** How many numbers the parser read out of it. */
  count: number;
};

export type Reading = {
  paper: string;
  table: string;
  row: number;
  system: string;
  cells: ReadingCell[];
  /** The stated average: the last cell, and the only one with a verdict. */
  average: { header: string; claimed: string; computed: string; delta: string; verdict: Verdict };
  /** How many numbers the row prints in total, across every cell but the average. */
  values: number;
};

export function reading(): Reading | null {
  const report = listReports().find((r) => r.arxiv_id === PAPER);
  const table = (report?.tables ?? []).find((t) => t.label === TABLE);
  const check = (report?.checks ?? []).find((c) => c.checker === "row_arithmetic");
  const finding = check?.findings?.[0];
  if (!table?.cells || !finding) return null;

  const headers = new Map(
    table.cells.filter((c) => c.row === 0).map((c) => [c.col, c.text ?? ""]),
  );
  const row = table.cells.filter((c) => c.row === ROW).sort((a, b) => a.col - b.col);
  const last = row[row.length - 1];

  // Column 0 is the system name, not a reading. The final column is the stated
  // average, which is what the other cells are being compared against, so it is
  // held out of the grid and given the verdict of its own.
  const body = row.filter((c) => c.col > 0 && c.col < (last?.col ?? 0));

  return {
    paper: PAPER,
    table: TABLE,
    row: ROW,
    system: row[0]?.text ?? "",
    cells: body.map((c) => ({
      header: headers.get(c.col) ?? "",
      text: c.text ?? "",
      count: (c.values ?? []).length,
    })),
    average: {
      header: headers.get(last?.col ?? 0) ?? "Average",
      claimed: finding.claimed ?? "",
      computed: finding.computed ?? "",
      delta: finding.delta ?? "",
      verdict: check?.verdict ?? "within_tolerance",
    },
    values: body.reduce((n, c) => n + (c.values ?? []).length, 0),
  };
}
