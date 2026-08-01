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

const HEADER_RULE = "2px";

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

  function renderCell(cell: Cell, isHead: boolean) {
    if (spacers.has(cell.col)) {
      // Spacing, not a column: no id, no rule, no header, nothing to read.
      return <td key={cell.col} role="presentation" className="w-4 border-0 p-0" />;
    }

    const id = cellDomId(tableId, cell.row, cell.col);
    const mark = markByDomId.get(id);
    const selected = selectedDomId === id;
    const isNum = numeric.has(cell.col) && !isHead && !cell.is_header;

    const props = {
      id,
      colSpan: cell.colspan && cell.colspan > 1 ? cell.colspan : undefined,
      rowSpan: cell.rowspan && cell.rowspan > 1 ? cell.rowspan : undefined,
      "data-pv-anchor": id,
      className: cn(
        "px-2.5 py-1.5 align-baseline",
        isNum ? "t-num text-right whitespace-nowrap" : "text-left",
        cell.is_bold && "font-semibold",
      ),
      style: {
        fontSize: isNum ? "14px" : "15px",
        color: "var(--paper-ink)",
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

  return (
    <figure className="my-10" id={tableId} data-pv-anchor={tableId}>
      <figcaption
        className="mb-2.5 flex items-baseline gap-2"
        style={{ color: "var(--paper-ink)" }}
      >
        {/* The caption's leading slot is the margin on this pane. A hanging
            column outside the measure was the plan's sketch and does not survive
            the two-pane report: at 1100px the document column is 55% of the
            window and the 68ch measure already fills it, so there is nothing to
            hang into. Leading the caption line puts the same mark in the same
            reading position at every width, which is what it is for. */}
        <SiglumMark
          siglum={tableMark?.siglum ?? ""}
          size={12}
          surface="paper"
          className="shrink-0"
        />
        <span
          className="t-num shrink-0"
          style={{ fontSize: "12px", opacity: 0.55, letterSpacing: "0.02em" }}
        >
          Table {index + 1}
        </span>
        {/* Same link, at table scale: a claim anchored to the whole table is
            selected by its caption, since the inline mark is hidden above
            760px. */}
        {tableMark ? (
          <button
            type="button"
            onClick={() => onSelect(tableMark.key)}
            aria-pressed={tableSelected}
            className="min-w-0 flex-1 rounded-[2px] text-start"
            style={{
              fontSize: "14px",
              lineHeight: 1.5,
              opacity: 0.72,
              boxShadow: tableSelected ? undefined : "inset 2px 0 0 0 var(--anchor-rest)",
              paddingInlineStart: tableSelected ? undefined : "8px",
            }}
          >
            {table.caption || table.label || "No caption"}
            <span className="sr-only"> — {tableMark.locator}. Select this claim.</span>
          </button>
        ) : (
          <span
            className="min-w-0 flex-1"
            style={{ fontSize: "14px", lineHeight: 1.5, opacity: 0.72 }}
          >
            {table.caption || table.label || "No caption"}
          </span>
        )}
        {tableMark && (
          <InlineMark mark={tableMark} active={tableSelected} onSelect={onSelect} />
        )}
      </figcaption>

      {/* A ten-column GLUE table does not fit 390px and never will. It scrolls
          sideways rather than being reflowed, wrapped, or dropped — the columns
          are the paper's own and none of them may go missing. */}
      <div data-pv-hscroll className="-mx-1 overflow-x-auto px-1">
        <table
          className="border-collapse"
          style={{
            minWidth: "100%",
            // Both rules are the paper's, not the chrome's.
            borderTop: `${HEADER_RULE} solid var(--paper-rule)`,
            borderBottom: `${HEADER_RULE} solid var(--paper-rule)`,
            background: tableSelected ? "var(--anchor-live)" : "transparent",
            transition: reduced
              ? "none"
              : `background-color ${HIGHLIGHT_MS}ms var(--ease-out) ${SCROLL_MS}ms`,
          }}
        >
          {head.length > 0 && (
            <thead>
              {head.map((row, i) => (
                <tr
                  key={row.row}
                  style={
                    i === head.length - 1
                      ? { borderBottom: "1px solid var(--paper-rule)" }
                      : undefined
                  }
                >
                  {row.cells.map((c) => renderCell(c, true))}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {body.map((row, i) => {
              // The paper's own \midrule / \specialrule boundaries.
              const newBlock = i > 0 && row.block !== body[i - 1].block;
              return (
                <tr
                  key={row.row}
                  style={
                    newBlock ? { borderTop: "1px solid var(--paper-rule)" } : undefined
                  }
                >
                  {row.cells.map((c) => renderCell(c, false))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(table.parse_warnings ?? []).length > 0 && (
        <p
          className="mt-2 t-num"
          style={{ fontSize: "12px", color: "var(--paper-ink)", opacity: 0.55 }}
        >
          The parser could not fully resolve this table:{" "}
          {(table.parse_warnings ?? []).join("; ")}
        </p>
      )}
    </figure>
  );
}
