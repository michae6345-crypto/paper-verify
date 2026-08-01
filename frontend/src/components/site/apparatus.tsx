import type { ReactNode } from "react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL, reasonLabel } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";

import { checkFrom, findingFrom } from "./corpus.server";
import { Siglum } from "./section";

/**
 * What the checks are, as an apparatus rather than a feature grid.
 *
 * DESIGN_PLAN.md replaces the bento with the form a textual editor uses: one
 * entry per check, each carrying a siglum, a real claimed reading against a real
 * computed one, and the place both came from. The content is the corpus verbatim
 * and the form is borrowed from the apparatus criticus, which has been solving
 * exactly this problem — record two readings, cite both witnesses, decline to
 * choose when the evidence does not settle it — for about a thousand years.
 *
 * A cell with no reading is not padded with one. `Dead links` matched and
 * produced no finding, so its entry says that instead of inventing a pair.
 */

type Row = { label: string; value: string; note?: string };

function Reading({ rows }: { rows: Row[] }) {
  return (
    <dl
      className="mt-5 border-l pl-4 two:pl-5"
      style={{ borderColor: "var(--grid)" }}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-1">
          <dt
            className="t-num w-[76px] shrink-0"
            style={{ color: "var(--mark)", fontSize: "12px" }}
          >
            {row.label}
          </dt>
          <dd className="t-num" style={{ color: "var(--ink)", fontSize: "13px" }}>
            {row.value}
          </dd>
          {row.note && (
            <dd className="t-num" style={{ color: "var(--ink-dim)", fontSize: "12px" }}>
              {row.note}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function Entry({
  siglum,
  name,
  sentence,
  verdict,
  reading,
  note,
  source,
}: {
  siglum: string;
  name: string;
  sentence: string;
  verdict: Verdict;
  reading: Row[];
  note?: ReactNode;
  source: string;
}) {
  return (
    <li
      className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-4 gap-y-0 border-t py-8 two:grid-cols-[32px_minmax(0,1fr)] two:gap-x-6"
      style={{ borderColor: "var(--grid)" }}
    >
      {/* The siglum sits on the entry at every width, not only in the margin, so
          the margin never carries meaning it alone holds. */}
      <div className="pt-0.5">
        <Siglum mark={siglum} />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h3
            style={{
              fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
              fontWeight: 400,
              color: "var(--ink)",
              fontSize: "22px",
              lineHeight: 1.3,
            }}
          >
            {name}
          </h3>
          <span className="flex shrink-0 items-center gap-2">
            {/* Colour rides on the glyph, which is distinct in shape alone; the
                word is in the field's own ink, so the pair is legible on both
                fields and without colour at all (§12). */}
            <VerdictGlyph verdict={verdict} size={12} />
            <span className="t-num" style={{ color: "var(--ink)", fontSize: "13px" }}>
              {VERDICT_LABEL[verdict]}
            </span>
          </span>
        </div>

        <p
          className="mt-3 max-w-[64ch]"
          style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.6 }}
        >
          {sentence}
        </p>

        <Reading rows={reading} />

        {note && (
          <p
            className="mt-5 max-w-[64ch]"
            style={{ color: "var(--ink-dim)", fontSize: "14px", lineHeight: 1.6 }}
          >
            {note}
          </p>
        )}

        <p className="mt-5 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
          {source}
        </p>
      </div>
    </li>
  );
}

export function Apparatus() {
  const bold = checkFrom("1706.03762", "bold_extreme");
  const arith = checkFrom("1810.04805", "row_arithmetic");
  const finding = findingFrom("1810.04805", "row_arithmetic");

  return (
    <>
      {/* Capped well below the field width. An entry is a reading and its
          citation, and a verdict sitting 900px from the heading it belongs to
          stops being part of the same statement. */}
      <ul className="mt-14 flex max-w-[880px] flex-col">
        <Entry
          siglum="a"
          name={bold?.display_name ?? "Bolded value is the best in its block"}
          sentence={
            bold?.description ??
            "Checks that each bolded number is the best value in its column, comparing only within the same rule-delimited block of the table."
          }
          verdict={bold?.verdict ?? "matches"}
          reading={[
            { label: "claimed", value: "41.29", note: "bolded, block 1 (ensembles)" },
            { label: "computed", value: "41.29", note: "best in block 1" },
            { label: "block 0", value: "39.2  39.92  40.46  40.56" },
            { label: "block 1", value: "40.4  41.16  41.29" },
            { label: "block 2", value: "38.1  41.8" },
            { label: "source", value: "tab:wmt-results", note: "column EN-FR" },
          ]}
          note={
            <>
              Two values in that column are bolded and both are correct: 41.29 is the best
              ensemble, 41.8 the best result overall. Comparing a bolded value against its whole
              column instead of its rule-delimited block reports a divergence here, and it would be
              wrong.
            </>
          }
          source="fixtures/reports/1706.03762.json · fixtures/GROUND_TRUTH.md case 1"
        />

        <Entry
          siglum="b"
          name={arith?.display_name ?? "Average columns match their row"}
          sentence={
            arith?.description ??
            "Checks that a column labelled average, mean or overall equals the mean of the other numbers in the same row, to the precision they were printed at."
          }
          verdict={arith?.verdict ?? "within_tolerance"}
          reading={[
            { label: "claimed", value: finding?.claimed ?? "71.0" },
            { label: "computed", value: finding?.computed ?? "70.944" },
            { label: "delta", value: finding?.delta ?? "+0.056" },
            {
              label: "source",
              value: finding?.anchor.table_label ?? "tab:glue_official",
              note: finding?.anchor.human_locator?.replace(/^[^,]+,\s*/, "") ?? "row 3",
            },
          ]}
          note={
            <>
              The corpus&rsquo;s one real finding. 71.0 sits 0.056 from the mean of its own row,
              just outside the rounding that printing one decimal place implies, so it is recorded
              within tolerance and not as a divergence. How close is close enough is not a judgement
              the checker makes: it reads it from{" "}
              <code className="t-num" style={{ fontSize: "13px" }}>
                policies/tolerance.yaml
              </code>
              , versioned, so revising the band replays stored readings rather than re-accusing
              anyone.
            </>
          }
          source="fixtures/reports/1810.04805.json · policies/tolerance.yaml v1"
        />

        <Entry
          siglum="c"
          name="Dead links"
          sentence="Requests every URL the paper prints and reports the ones the server says are gone."
          verdict="matches"
          reading={[
            { label: "reading", value: "no URL reported gone" },
            { label: "finding", value: "none" },
            { label: "source", value: "1706.03762", note: "recorded CLI run" },
          ]}
          note={
            <>
              A check that matches produces no finding, so there is no pair of readings to record.
              The entry says so rather than manufacturing one.
            </>
          }
          source="README.md, recorded CLI run"
        />

        <Entry
          siglum="d"
          name="Citation existence"
          sentence="Looks up each reference in Crossref and OpenAlex and reports confirmed retractions."
          verdict="unverifiable"
          reading={[
            { label: "reading", value: "reference not found in either index" },
            { label: "reason", value: "reference_not_indexed" },
            {
              label: "meaning",
              value: reasonLabel("reference_not_indexed") ?? "Reference not indexed",
            },
            { label: "source", value: "1706.03762", note: "recorded CLI run" },
          ]}
          note={
            <>
              A reference neither index knows about is unverifiable, not missing. Matching titles by
              containment once paired &ldquo;Attention is all you need&rdquo; with &ldquo;Is
              Attention All You Need?&rdquo;, which is close enough to attribute another
              paper&rsquo;s retraction to the wrong authors.
            </>
          }
          source="README.md, recorded CLI run · README.md, what the corpus taught us"
        />
      </ul>

      <p
        className="mt-10 max-w-[880px] border-t pt-8"
        style={{ borderColor: "var(--grid)", color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.6 }}
      >
        Four checks exist. Three more are specified and not written: the abstract against the
        tables, the results against the paper&rsquo;s own code, and duplicate results across
        papers. Each needs a model to find the claim, so none of them is built and none of them is
        sold. When they land, a model will still never produce the verdict.
      </p>
      <p className="mt-3 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
        README.md status table · docs/BRIEF.md §9
      </p>
    </>
  );
}
