"use client";

import { useMemo } from "react";

import type { Cell, Table, Verdict } from "@/types/run-report";
import { cn } from "@/lib/utils";
import { cellDomId, type Mark } from "@/components/gutter/marks";
import { InlineMark } from "@/components/gutter/inline-mark";
import { SiglumMark } from "@/components/gutter/siglum-mark";
import { HIGHLIGHT_MS, SCROLL_MS } from "./scroll";

/**
 * One parsed `tabular`, rendered as a real HTML table on the paper surface.
 *
 * Four things about the real data shape this (see CLAUDE.md and the fixtures):
 *
 *   - `is_spacer` columns are layout, not data. The Transformer's results table
 *     puts an empty column between the BLEU pair and the Training Cost pair.
 *     It renders as a gap with no header and no border, never as a column.
 *   - `block` segments rows into the paper's own rule-delimited groups. Drawing
 *     those rules is what makes the two bolded EN-FR values in that same table
 *     read as correct rather than as a contradiction.
 *   - An empty cell means "not reported", never zero. It renders blank. No dash,
 *     no zero, no em-space stand-in that could be read as a value.
 *   - A cell may hold several numbers — BERT writes MNLI matched/mismatched as
 *     `86.7/85.9`. `text` is printed verbatim; it is never reformatted into one
 *     number, because that is precisely the lossy narrowing that produced five
 *     false divergences on this table once already.
 */

/**
 * Booktabs, reproduced.
 *
 * `booktabs` is what essentially every ML paper sets its tables with, and its
 * whole argument is three rule weights and no vertical rules at all: `\toprule`
 * and `\bottomrule` at 0.08em, `\midrule` at 0.05em, and `\addlinespace` opening
 * a little air on either side of a rule so the rows do not sit on it.
 *
 * The rules are drawn in `--paper-ink`. They were `--paper-rule`, which is
 * #e0e0e0 — a UI divider, and at that value the tables read as a web table with
 * faint separators rather than as anything a typesetter produced. A LaTeX rule is
 * the same ink as the type it separates. `--paper-rule` keeps its job on the
 * lighter dividers this pane draws around the table, not on the table's own
 * rules.
 */
const RULE_OUTER = "1.5px";
const RULE_INNER = "1px";
/** `\addlinespace`: the air a rule gets on the side the rows are on. */
const RULE_SPACE = "6px";

/** The float's number, run into the head of its caption. */
const LABEL_STYLE = {
  font: "inherit",
  fontVariantCaps: "small-caps",
  letterSpacing: "0.06em",
  fontWeight: 600,
} as const;

type Row = { row: number; cells: Cell[]; block: number; isHeader: boolean };

function toRows(cells: Cell[]): Row[] {
  const byRow = new Map<number, Cell[]>();
  cells.forEach((c) => {
    const list = byRow.get(c.row) ?? [];
    list.push(c);
    byRow.set(c.row, list);
  });
  return [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, list]) => {
      const sorted = [...list].sort((a, b) => a.col - b.col);
      return {
        row,
        cells: sorted,
        block: sorted[0]?.block ?? 0,
        isHeader: sorted.length > 0 && sorted.every((c) => c.is_header),
      };
    });
}

/**
 * Which columns are numbers, and so get IBM Plex Mono with tabular-nums and
 * align right. Label columns stay in the document serif and align left. Decided
 * per column, not per cell, so one unparseable entry does not make a column
 * jitter between two typefaces.
 *
 * "Any cell parsed a number" is the obvious test and it is wrong: BERT's SQuAD
 * table names systems `#1 Ensemble - nlnet` and `#2 Ensemble - QANet`, so the
 * parser reads a value out of two cells in a column of prose and the whole
 * system column sets in mono, right-aligned, as if the names were data. A
 * majority is required instead, over the non-empty body cells.
 */
const NUMERIC_SHARE = 0.6;

function numericColumns(rows: Row[]): Set<number> {
  const counts = new Map<number, { numeric: number; filled: number }>();
  rows.forEach((r) => {
    if (r.isHeader) return;
    r.cells.forEach((c) => {
      if (c.is_header || c.text.trim() === "") return;
      const seen = counts.get(c.col) ?? { numeric: 0, filled: 0 };
      seen.filled += 1;
      if ((c.values ?? []).length > 0) seen.numeric += 1;
      counts.set(c.col, seen);
    });
  });

  const out = new Set<number>();
  counts.forEach(({ numeric, filled }, col) => {
    if (filled > 0 && numeric / filled >= NUMERIC_SHARE) out.add(col);
  });
  return out;
}

/**
 * An anchored span — a cell some claim in the ledger points at — carries a 2px
 * left rule in `--anchor-rest` at all times, so a reader can see which numbers
 * on the page have a claim attached before touching anything. Selection swaps it
 * for the live highlight. A rule rather than a fill: the paper is an artifact and
 * shading a fifth of its cells would restyle the document rather than annotate
 * it (UI_PLAN.md).
 */
function anchorRule(anchored: boolean, selected: boolean) {
  if (!anchored || selected) return undefined;
  return "inset 2px 0 0 0 var(--anchor-rest)";
}

function highlightStyle(selected: boolean, verdict: Verdict | null, reduced: boolean) {
  if (!selected) {
    return {
      backgroundColor: "transparent",
      transition: `background-color ${HIGHLIGHT_MS}ms var(--ease-out)`,
    } as const;
  }
  return {
    backgroundColor: "var(--anchor-live)",
    // §5.4: a 1px --v-diverges outline, but only when the finding is divergent.
    // A `matches` mark gets the highlight alone — the outline is an accusation.
    outline: verdict === "diverges" ? "1px solid var(--v-diverges)" : undefined,
    outlineOffset: "-1px",
    // §6: the scroll runs first, then the highlight fades in over 200ms and holds.
    transition: reduced
      ? "none"
      : `background-color ${HIGHLIGHT_MS}ms var(--ease-out) ${SCROLL_MS}ms`,
  } as const;
}

export function PaperTable({
  table,
  index,
  tableId,
  marks,
  selectedDomId,
  selectedVerdict,
  reduced,
  onSelect,
}: {
  table: Table;
  index: number;
  tableId: string;
  marks: Mark[];
  selectedDomId: string | null;
  selectedVerdict: Verdict | null;
  reduced: boolean;
  onSelect: (key: string) => void;
}) {
  const rows = useMemo(() => toRows(table.cells ?? []), [table.cells]);
  const numeric = useMemo(() => numericColumns(rows), [rows]);
  const spacers = useMemo(
    () => new Set((table.columns ?? []).filter((c) => c.is_spacer).map((c) => c.index)),
    [table.columns],
  );

  const markByDomId = useMemo(() => {
    const m = new Map<string, Mark>();
    marks.forEach((mark) => m.set(mark.domId, mark));
    return m;
  }, [marks]);

  // The leading run of header rows is the thead. A header row further down is a
  // real sub-heading in the paper and stays in the body, as a th.
  let headEnd = 0;
  while (headEnd < rows.length && rows[headEnd].isHeader) headEnd++;
  const head = rows.slice(0, headEnd);
  const body = rows.slice(headEnd);

  const tableMark = markByDomId.get(tableId) ?? null;
  const tableSelected = selectedDomId === tableId;

  /**
   * `spaceAbove` / `spaceBelow` are `\addlinespace`: the air a row gets on the
   * side a rule is on. A single-row head takes both, since it has the toprule
   * over it and the midrule under it.
   */
  function renderCell(
    cell: Cell,
    isHead: boolean,
    spaceAbove = false,
    spaceBelow = false,
  ) {
    if (spacers.has(cell.col)) {
      // Spacing, not a column: no id, no rule, no header, nothing to read.
      return <td key={cell.col} role="presentation" className="w-4 border-0 p-0" />;
    }

    const id = cellDomId(tableId, cell.row, cell.col);
    const mark = markByDomId.get(id);
    const selected = selectedDomId === id;
    const numericColumn = numeric.has(cell.col);
    const isNum = numericColumn && !isHead && !cell.is_header;

    const props = {
      id,
      colSpan: cell.colspan && cell.colspan > 1 ? cell.colspan : undefined,
      rowSpan: cell.rowspan && cell.rowspan > 1 ? cell.rowspan : undefined,
      "data-pv-anchor": id,
      className: cn(
        // `\tabcolsep` is 6pt a side by default, which is the 8px here. The
        // rows are tighter than a web table's on purpose: a LaTeX table is set
        // denser than the prose around it, and that density is most of why one
        // reads as typeset and the other as a layout.
        "px-2 py-[5px]",
        // A column of figures is right-aligned and so is the head that names it.
        // Aligning the header left over an `r` column is the tell that a table
        // was built out of divs, and it is exactly what this one was doing.
        numericColumn ? "text-right" : "text-left",
        isNum ? "t-num align-baseline whitespace-nowrap" : "align-bottom",
        cell.is_bold && "font-semibold",
      ),
      style: {
        fontSize: isNum ? "13.5px" : "14.5px",
        lineHeight: 1.4,
        color: "var(--paper-ink)",
        // `\addlinespace`, on whichever side of the row the rule is.
        paddingTop: spaceAbove ? RULE_SPACE : undefined,
        paddingBottom: spaceBelow ? RULE_SPACE : undefined,
        boxShadow: anchorRule(mark != null, selected),
        ...highlightStyle(selected, selected ? selectedVerdict : null, reduced),
      },
    };

    // The paper drives the ledger. Clicking an anchored span selects its claim —
    // the same call the gutter mark makes, so both directions of the link are
    // one code path. The button is what makes the span reachable by keyboard on
    // the wide layout, where the inline mark is hidden; the cell keeps its table
    // semantics, and an unanchored cell stays plain text.
    const content = (
      <>
        {mark ? (
          <button
            type="button"
            onClick={() => onSelect(mark.key)}
            aria-pressed={selected}
            className="rounded-[2px] text-inherit"
            style={{ font: "inherit", letterSpacing: "inherit" }}
          >
            {/* Verbatim. `86.7/85.9` stays `86.7/85.9`. */}
            {cell.text}
            <span className="sr-only">
              {" "}
              — {mark.locator}. Select this claim.
            </span>
          </button>
        ) : (
          cell.text
        )}
        {/* The mark rides the reading, the way an apparatus cites a variant in
            the text it is about. Raised and quarter-size so it annotates the
            value rather than joining it — a mark that sat on the baseline beside
            `41.8` would read as part of the number. */}
        {mark && (
          <SiglumMark
            siglum={mark.siglum}
            size={10}
            surface="paper"
            className="ms-[3px] align-super"
          />
        )}
        {mark && (
          <InlineMark
            mark={mark}
            active={selected}
            onSelect={onSelect}
            className="ms-1.5 align-middle"
          />
        )}
      </>
    );

    return isHead || cell.is_header ? (
      <th key={cell.col} {...props} scope={isHead ? "col" : undefined}>
        {content}
      </th>
    ) : (
      <td key={cell.col} {...props}>
        {content}
      </td>
    );
  }

  const captionText = table.caption || table.label || "No caption";

  return (
    <figure className="my-12" id={tableId} data-pv-anchor={tableId}>
      {/* A LaTeX table caption sits ABOVE the float, runs the measure, is set a
          step below the body, and opens with a numbered run-in label. The old
          caption was a flex row — a mark, a "Table 1" chip and a left-ruled block
          of text sitting in three columns — which is a UI list item, not a
          caption, and it was the loudest thing on this pane saying "web page".
          It is one justified paragraph now.

          Justified, because these are the paper's words. residual's own note at
          the head of the pane is ranged left in the sans face for exactly the
          same reason, in the other direction. */}
      {/* Justified from 760px up and ragged right below it. Justification needs
          a column wide enough to absorb the slack: a 390px phone gives a caption
          about 45 characters, and at that measure one long token forces a line
          holding two words and a gap most of its width. LaTeX's own two-column
          measure is around 240pt for the same reason — the narrow setting is
          where justification stops paying for itself. */}
      <figcaption
        className="mb-3 text-left two:text-justify"
        style={{
          fontSize: "14px",
          lineHeight: 1.55,
          color: "var(--paper-ink)",
          hyphens: "auto",
          // BERT's Table 1 caption carries a bare
          // `(https://gluebenchmark.com/leaderboard)`, which is 38 unbreakable
          // characters — wider than a 390px line can hold. Justification then
          // opened a gap most of a line wide on the row above it while it waited
          // for somewhere to put the URL. `break-word` only breaks a token that
          // could not fit on a line of its own, so nothing else in a caption is
          // touched.
          overflowWrap: "break-word",
          // The anchor rule belongs to the caption BLOCK, not to the button
          // inside it. On the button it forced `display: inline-block`, which
          // cannot break across lines: the caption took a line of its own, and
          // justification then threw "Table" and "1." to opposite margins with
          // the whole caption stranded underneath. Hung 8px into the margin, so
          // the caption text still ranges with the table's first column.
          boxShadow:
            tableMark && !tableSelected ? "inset 2px 0 0 0 var(--anchor-rest)" : undefined,
          paddingInlineStart: tableMark && !tableSelected ? "8px" : undefined,
          marginInlineStart: tableMark && !tableSelected ? "-8px" : undefined,
        }}
      >
        {/* The margin mark leads the line. A hanging column outside the measure
            was the plan's sketch and does not survive the two-pane report: at
            1100px the document column is 55% of the window and the 68ch measure
            already fills it, so there is nothing to hang into. Leading the line
            puts the same mark in the same reading position at every width. */}
        {tableMark?.siglum && (
          <SiglumMark
            siglum={tableMark.siglum}
            size={12}
            surface="paper"
            className="me-2"
          />
        )}
        {/* The run-in label, in the small-caps register a float number is set
            in. Not mono: this is the paper numbering its own float, not a value.

            THE LABEL IS THE CONTROL and the caption beside it is plain prose.
            A `<button>` is an atomic inline-level box in every engine —
            `display: inline` does not make one break across lines — so wrapping
            the caption text in it took a whole line for itself, and justifying
            that line threw "Table" and "1." to opposite margins with the caption
            stranded underneath. The float's number is three characters and sits
            in a line without disturbing it, which is what makes it the one place
            on this block a control can go. It is also the right name for the
            target: a claim anchored to the whole table is selected by the
            table's number, not by a sentence describing it. */}
        {tableMark ? (
          <button
            type="button"
            onClick={() => onSelect(tableMark.key)}
            aria-pressed={tableSelected}
            className="rounded-[2px]"
            style={{ ...LABEL_STYLE, color: "inherit" }}
          >
            Table {index + 1}
            <span className="sr-only"> — {tableMark.locator}. Select this claim.</span>
          </button>
        ) : (
          <span style={LABEL_STYLE}>Table {index + 1}</span>
        )}
        <span aria-hidden>{". "}</span>
        {captionText}
        {tableMark && (
          <InlineMark
            mark={tableMark}
            active={tableSelected}
            onSelect={onSelect}
            className="ms-1.5 align-middle"
          />
        )}
      </figcaption>

      {/* A ten-column GLUE table does not fit 390px and never will. It scrolls
          sideways rather than being reflowed, wrapped, or dropped — the columns
          are the paper's own and none of them may go missing. */}
      <div data-pv-hscroll className="-mx-1 overflow-x-auto px-1">
        {/* Centred at its natural width, which is what a `table` float does. It
            used to be stretched to `min-width: 100%`, so a three-column table
            spread its columns across the whole measure and stopped looking like
            a table at all. */}
        <table
          className="mx-auto border-collapse"
          style={{
            borderTop: `${RULE_OUTER} solid var(--paper-ink)`,
            borderBottom: `${RULE_OUTER} solid var(--paper-ink)`,
            background: tableSelected ? "var(--anchor-live)" : "transparent",
            transition: reduced
              ? "none"
              : `background-color ${HIGHLIGHT_MS}ms var(--ease-out) ${SCROLL_MS}ms`,
          }}
        >
          {head.length > 0 && (
            <thead>
              {head.map((row, i) => {
                const last = i === head.length - 1;
                return (
                  <tr
                    key={row.row}
                    style={
                      last
                        ? { borderBottom: `${RULE_INNER} solid var(--paper-ink)` }
                        : undefined
                    }
                  >
                    {/* Air under the toprule for the first head row, and above
                        the midrule for the last one. */}
                    {row.cells.map((c) => renderCell(c, true, i === 0, last))}
                  </tr>
                );
              })}
            </thead>
          )}
          <tbody>
            {body.map((row, i) => {
              // The paper's own \midrule / \specialrule boundaries. Same weight
              // as the head rule, because in the source they are the same
              // command.
              const newBlock = i > 0 && row.block !== body[i - 1].block;
              return (
                <tr
                  key={row.row}
                  style={
                    newBlock
                      ? { borderTop: `${RULE_INNER} solid var(--paper-ink)` }
                      : undefined
                  }
                >
                  {/* Air under every rule the rows sit below: the head rule for
                      the first body row, a block rule for the rest. The last
                      row takes it above the bottomrule too. */}
                  {row.cells.map((c) =>
                    renderCell(c, false, i === 0 || newBlock, i === body.length - 1),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A note about the float, so it is set as one: smaller than the caption,
          in residual's own secondary ink. */}
      {(table.parse_warnings ?? []).length > 0 && (
        <p
          className="mt-3 text-center"
          style={{
            fontFamily: "var(--font-ui), ui-sans-serif, sans-serif",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--paper-dim)",
          }}
        >
          The parser could not fully resolve this table:{" "}
          {(table.parse_warnings ?? []).join("; ")}
        </p>
      )}
    </figure>
  );
}
