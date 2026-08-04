"use client";

import { forwardRef, useMemo } from "react";

import type { RunReport, Verdict } from "@/types/run-report";
import { marksByTable, tableDomIds, type Mark } from "@/components/gutter/marks";
import { PaperTable } from "./paper-table";

/**
 * The document pane (§4): always light, always serif, never inverts. One half of
 * §2's two materials — the paper as an artifact, held against the instrument.
 *
 * It is set as a typeset document, not as a web page about one. A centred title
 * block over a 68ch measure, floats numbered and captioned above the rule the way
 * LaTeX numbers and captions them, booktabs rules in the paper's own ink, and the
 * paper's prose justified with hyphenation. The instrument on the other side of
 * the gutter is dense, dark and sans; this side is a page. The opposition is the
 * concept (§2) and neither half may drift toward the other.
 *
 * TWO VOICES ON ONE SURFACE, and they are set differently on purpose. The paper's
 * words — a caption, a cell — are serif and justified. residual's words about the
 * paper are the sans UI face, ranged left, in `--paper-dim`, under the
 * construction hairline. A reader must never have to work out which of the two
 * is talking, because mistaking the second for the first is attributing our
 * sentence to the author.
 *
 * What it renders is what the checker read: the paper's title and every table it
 * parsed, with a stable DOM id on every cell so the gutter has something exact to
 * align to. `RunReport` carries no abstract, no section headings and no body
 * prose, so none of the three is shown — a document pane that invented running
 * text or numbered sections the parser never saw would be the same lossy
 * narrowing this codebase keeps producing, only in reverse. The tables are the
 * document's numbered structure because the tables are what there is.
 *
 * §3 gives the paper three colours; `--paper-dim` is the secondary ink globals.css
 * added for light surfaces, so quieter text here is that rather than opacity on
 * `--paper-ink`.
 */
export const DocumentView = forwardRef<
  HTMLDivElement,
  {
    report: RunReport;
    marks: Mark[];
    selectedDomId: string | null;
    selectedVerdict: Verdict | null;
    reduced: boolean;
    onSelect: (key: string) => void;
    /**
     * Whether the marks exist on this surface. The run view renders the same
     * document with no apparatus attached to it yet, and telling that reader
     * that "each mark points at the cell a check looked at" would describe marks
     * that are not on their screen.
     */
    annotated?: boolean;
  }
>(function DocumentView(
  { report, marks, selectedDomId, selectedVerdict, reduced, onSelect, annotated = true },
  ref,
) {
  const tables = useMemo(
    () => (report.tables ?? []).filter((t) => !t.is_nested),
    [report.tables],
  );
  const byTable = useMemo(() => marksByTable(marks), [marks]);
  // The same list the marks were derived against, so a mark's `domId` and the
  // element's `id` cannot drift apart when two tables share a label.
  const ids = useMemo(() => tableDomIds(tables), [tables]);

  return (
    <div
      ref={ref}
      className="h-full overflow-y-auto"
      style={{ background: "var(--paper)" }}
      aria-label="Paper"
    >
      {/* `lang` is what switches hyphenation on: `hyphens: auto` does nothing
          without a language to hyphenate against, and justified text at this
          measure without it opens rivers. Every fixture is an English-language
          arXiv paper. */}
      <article
        lang="en"
        className="measure-doc mx-auto px-5 pt-12 pb-10 t-doc two:px-8 two:pt-16"
      >
        {/* The title block, centred, the way `\maketitle` sets one. This is the
            single strongest signal that the pane is a document: a paper opens
            with its title over the measure, not with a left-ranged page heading.

            Source Serif 4 carries an optical size axis, so the display step
            picks up its own stroke contrast — the hierarchy is the size and the
            face, never a heavier weight (DESIGN_PLAN.md). */}
        <header className="text-center">
          <h1
            className="font-normal text-balance"
            style={{ fontSize: "clamp(26px, 2.6vw, 33px)", lineHeight: 1.18 }}
          >
            {report.title || "Untitled paper"}
          </h1>
          {/* The slot a paper puts its authors and affiliation in. We have an
              identifier and nothing else, so the identifier stands there rather
              than a line of invented names. */}
          <p className="mt-5 t-num" style={{ fontSize: "13px", color: "var(--paper-dim)" }}>
            arXiv:{report.arxiv_id}
          </p>
        </header>

        {/* residual speaking, not the paper. Our construction grid rules it off
            (`--rule-grid`, the hairline that crosses a light field) and it is
            set in the UI sans at a smaller step, so nothing in this block can be
            mistaken for the author's own front matter. `--paper-rule` is left to
            the tabular rules the paper actually draws. */}
        <section
          className="mt-10 border-y py-3.5 two:mt-12"
          style={{ borderColor: "var(--rule-grid)" }}
        >
          <p
            className="t-body"
            style={{ fontFamily: "var(--font-ui), ui-sans-serif, sans-serif", color: "var(--paper-dim)" }}
          >
            {tables.length === 0 ? (
              <>
                No tables were parsed from this paper&apos;s source, so there is nothing here to
                align marks to. The claims list still gives what each check was able to say.
              </>
            ) : (
              <>
                {/* Deliberately not "in the margin": below 760px there is no
                    margin, and the marks sit in the cells themselves. */}
                {tables.length === 1 ? "The one table" : `The ${tables.length} tables`} the
                checker parsed from the LaTeX source,{" "}
                {/* DESIGN_PLAN.md's wash: one phrase, once, behind residual's own
                    words. It sits on this line and nowhere else on the pane,
                    because `--anchor-live` is the paper's other highlight and two
                    highlight blocks on one surface would each weaken the other.
                    Nothing below this rule is ever washed — the tables carry the
                    live anchor instead. */}
                <span
                  className="box-decoration-clone px-1 py-[1px]"
                  style={{ background: "var(--wash)" }}
                >
                  as it read them
                </span>
                {/* Direction-free on purpose: the run rail is beside this pane
                    above 760px and stacked over it below, so "in the rail" is
                    the only phrasing that stays true at every width. */}
                . {annotated
                  ? "Each mark points at the cell a check looked at."
                  : "The checks in the rail read this same source."}
              </>
            )}
          </p>
        </section>

        {tables.length > 0 && (
          <>
            {tables.map((table, i) => {
              const id = ids[i];
              return (
                <PaperTable
                  key={id}
                  table={table}
                  index={i}
                  tableId={id}
                  marks={byTable.get(i) ?? []}
                  selectedDomId={selectedDomId}
                  selectedVerdict={selectedVerdict}
                  reduced={reduced}
                  onSelect={onSelect}
                />
              );
            })}
          </>
        )}

        {/* Room to scroll the last table up to reading position, so a mark on it
            can sit level with its cell rather than pinned to the bottom edge. */}
        <div aria-hidden className="h-[40dvh]" />
      </article>
    </div>
  );
});
