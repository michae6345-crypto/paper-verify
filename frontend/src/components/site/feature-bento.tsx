import type { ReactNode } from "react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";
import { cn } from "@/lib/utils";

import { checkFrom, findingFrom } from "./corpus.server";
import { Output } from "./section";

/**
 * §16 §3. One cell per check. Each shows what the check does in one sentence and
 * what it actually said about a real paper, in IBM Plex Mono.
 *
 * The `source` line on every cell is deliberate: a claim about a named paper
 * that does not say where it came from is exactly the shape of thing this
 * product exists to object to.
 *
 * Only four checks exist. The fifth cell says so rather than padding the grid.
 */

function Cell({
  name,
  sentence,
  verdict,
  verdictNote,
  output,
  source,
  className,
}: {
  name: string;
  sentence: string;
  verdict?: Verdict;
  verdictNote?: string;
  output: ReactNode;
  source: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col border p-5", className)}
      style={{
        borderColor: "var(--chrome-line)",
        background: "var(--chrome-panel)",
        borderRadius: "var(--radius-panel)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="t-panel-title" style={{ color: "var(--chrome-text)" }}>
          {name}
        </h3>
        {verdict && (
          <span className="flex shrink-0 items-center gap-1.5">
            <VerdictGlyph verdict={verdict} size={12} />
            <span
              className="whitespace-nowrap"
              style={{ color: "var(--chrome-dim)", fontSize: "12px" }}
            >
              {verdictNote ?? VERDICT_LABEL[verdict]}
            </span>
          </span>
        )}
      </div>

      <p className="mt-2" style={{ color: "var(--chrome-dim)", fontSize: "14px", lineHeight: 1.55 }}>
        {sentence}
      </p>

      <div
        className="mt-4 flex-1 border-t pt-4"
        style={{ borderColor: "var(--chrome-line)" }}
      >
        {output}
      </div>

      <p className="mt-4 t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
        {source}
      </p>
    </div>
  );
}

export function FeatureBento() {
  const bold = checkFrom("1706.03762", "bold_extreme");
  const arith = checkFrom("1810.04805", "row_arithmetic");
  const finding = findingFrom("1810.04805", "row_arithmetic");

  return (
    <div className="mt-10 grid gap-4 two:grid-cols-2 three:grid-cols-3">
      {/* Check 3 — the corpus's one real finding, so it gets the largest cell. */}
      <Cell
        className="three:col-span-2"
        name={arith?.display_name ?? "Average columns match their row"}
        sentence={
          arith?.description ??
          "Checks that a column labelled average, mean or overall equals the mean of the other numbers in the same row, to the precision they were printed at."
        }
        verdict={arith?.verdict}
        output={
          finding ? (
            <Output>
              {[
                `paper     1810.04805  BERT`,
                `table     ${finding.anchor.table_label ?? ""}`,
                `cell      ${finding.anchor.human_locator ?? finding.anchor.dom_id}`,
                ``,
                `claimed   ${finding.claimed}`,
                `computed  ${finding.computed}`,
                `delta     ${finding.delta}`,
                `verdict   ${arith ? VERDICT_LABEL[arith.verdict] : ""}`,
              ].join("\n")}
            </Output>
          ) : null
        }
        source="fixtures/reports/1810.04805.json"
      />

      {/* Check 1 — no finding to show, because the block rule is what stops one
          being produced. That is the point of the cell. */}
      <Cell
        className="three:row-span-2"
        name={bold?.display_name ?? "Bolded value is the best in its block"}
        sentence={
          bold?.description ??
          "Checks that each bolded number is the best value in its column, comparing only within the same rule-delimited block of the table."
        }
        verdict={bold?.verdict}
        output={
          <>
            <Output>
              {[
                `1706.03762  tab:wmt-results, EN-FR`,
                ``,
                `block 0   39.2 39.92 40.46 40.56`,
                `block 1   40.4 41.16 41.29*`,
                `block 2   38.1 41.8*`,
                ``,
                `* bolded in the source`,
              ].join("\n")}
            </Output>
            <p
              className="mt-4"
              style={{ color: "var(--chrome-faint)", fontSize: "13px", lineHeight: 1.55 }}
            >
              Two values in one column are bolded, and both are correct: 41.29 is the best
              ensemble, 41.8 the best overall. Comparing against the whole column instead of the
              rule-delimited block reports a divergence here. It would be wrong.
            </p>
          </>
        }
        source="fixtures/reports/1706.03762.json · fixtures/GROUND_TRUTH.md case 1"
      />

      {/* Check 6 */}
      <Cell
        name="Dead links"
        sentence="Requests every URL in the paper and reports the ones the server says are gone."
        verdict="matches"
        output={
          <Output>
            {[`$ python -m pv.cli 1706.03762`, ``, `  —  Dead links            matches`].join("\n")}
          </Output>
        }
        source="README.md, recorded CLI run"
      />

      {/* Check 2 */}
      <Cell
        name="Citation existence"
        sentence="Looks up each reference in Crossref and OpenAlex and reports confirmed retractions."
        verdict="unverifiable"
        output={
          <>
            <Output>
              {[
                `$ python -m pv.cli 1706.03762`,
                ``,
                `  ○  Citation existence    unverifiable`,
                `     reference_not_indexed`,
              ].join("\n")}
            </Output>
            <p
              className="mt-4"
              style={{ color: "var(--chrome-faint)", fontSize: "13px", lineHeight: 1.55 }}
            >
              A reference neither index knows about is unverifiable, not missing. Matching titles
              by containment once paired &ldquo;Attention is all you need&rdquo; with &ldquo;Is
              Attention All You Need?&rdquo;, which is close enough to attribute another
              paper&rsquo;s retraction.
            </p>
          </>
        }
        source="README.md, recorded CLI run · README.md, what the corpus taught us"
      />

      {/* Not a check. The grid stops here because the checker does. */}
      <div
        className="flex flex-col justify-between gap-4 border border-dashed p-5 two:col-span-2 three:col-span-3"
        style={{ borderColor: "var(--chrome-line)", borderRadius: "var(--radius-panel)" }}
      >
        <div>
          <h3 className="t-panel-title" style={{ color: "var(--chrome-dim)" }}>
            Four checks exist. Three more are specified and not written.
          </h3>
          <p
            className="mt-2 max-w-[70ch]"
            style={{ color: "var(--chrome-faint)", fontSize: "14px", lineHeight: 1.55 }}
          >
            Abstract against tables, claims against the paper&rsquo;s own code, and duplicate
            results across papers are the three that need a model to extract structure. They are
            not built, so they are not sold. When they land, a model will still never produce the
            verdict.
          </p>
        </div>
        <p className="t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
          README.md status table · docs/BRIEF.md §9
        </p>
      </div>
    </div>
  );
}
