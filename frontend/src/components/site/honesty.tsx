import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

import {
  CHECK_RUNS,
  NOT_CHECKED_ENTRIES,
  PAPERS,
  UNVERIFIABLE_BY_REASON,
  UNVERIFIABLE_RUNS,
  percent,
} from "./corpus";
import { Output } from "./section";

/**
 * What the checker cannot do, and how often it says so.
 *
 * The `unverifiable_rate_by_reason` figure is the §15.5 metric computed over the
 * committed corpus rather than over production traffic. There is no production
 * traffic: persistence is in memory and permalinks do not survive a restart. The
 * section says that in those words, because claiming production numbers on the
 * honesty section would be self-refuting.
 *
 * There is no bar chart here. A percentage beside a bar saying the same thing is
 * the bar doing no work, and the numbers are the product.
 */

const CANNOT: { what: string; because: string }[] = [
  {
    what: "Whether a paper is good, novel, or true",
    because:
      "Nothing here reads the argument. A paper whose numbers agree perfectly can still be wrong about everything that matters.",
  },
  {
    what: "Whether the numbers are the ones the experiments produced",
    because:
      "We compare a paper against itself. A table that is internally consistent and fabricated end to end reads as matches.",
  },
  {
    what: "A paper arXiv holds only as a PDF",
    because:
      "The checks run on LaTeX source. With no source there is nothing to parse, and the run says so instead of guessing from the rendered page.",
  },
  {
    what: "A table whose structure did not parse",
    because:
      "Rows that cover fewer columns than the column spec declares, or two tabulars resolving to one \\label. The table is named in the report and left alone.",
  },
  {
    what: "Anything that needs a model to find the claim",
    because:
      "Abstract against tables, results against the paper's own code, duplicate results across papers. Specified, not written.",
  },
];

export function Honesty() {
  return (
    <div className="mt-14 grid gap-14 three:grid-cols-[minmax(0,1fr)_380px] three:gap-16">
      <div className="min-w-0">
        <ul className="flex flex-col">
          {CANNOT.map((row) => (
            <li
              key={row.what}
              className="border-t py-5 first:border-t-0 first:pt-0"
              style={{ borderColor: "var(--grid)" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
                  color: "var(--ink)",
                  fontSize: "19px",
                  lineHeight: 1.4,
                }}
              >
                {row.what}
              </p>
              <p
                className="mt-2 max-w-[66ch]"
                style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.6 }}
              >
                {row.because}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 border-t pt-8" style={{ borderColor: "var(--grid)" }}>
          <div className="flex items-center gap-2.5">
            <VerdictGlyph verdict="unverifiable" size={12} />
            <h3 className="t-num" style={{ color: "var(--ink)", fontSize: "15px" }}>
              What declining looks like
            </h3>
          </div>
          <p
            className="mt-3 max-w-[66ch]"
            style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.6 }}
          >
            The Vision Transformer paper states a mean of 77.6 where the unweighted mean of the
            printed row is 74.450. That gap is large. We still do not call it a divergence, because
            nothing in the paper says which columns the mean covers, and averaging a subset of them
            gives the stated figure. The comparison is attached as evidence anyway. You see the
            numbers; we decline to draw the conclusion.
          </p>
          <div className="mt-5 border-l pl-5" style={{ borderColor: "var(--grid)" }}>
            <Output>
              {[
                `paper     2010.11929  tab:vtab_tasks, row 1, column "Mean"`,
                `claimed   77.6`,
                `computed  74.450`,
                `delta     +3.150`,
                `verdict   unverifiable`,
              ].join("\n")}
            </Output>
          </div>
          <p className="mt-5 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
            measured: fixtures/papers/2010.11929, network-free run
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <h3
          className="t-num"
          style={{ color: "var(--mark)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          Unverifiable rate, by reason
        </h3>

        <p
          className="mt-5"
          style={{ color: "var(--ink)", fontSize: "17px", lineHeight: 1.6 }}
        >
          <span className="t-num" style={{ fontSize: "17px" }}>
            {UNVERIFIABLE_RUNS}
          </span>{" "}
          of{" "}
          <span className="t-num" style={{ fontSize: "17px" }}>
            {CHECK_RUNS}
          </span>{" "}
          check runs returned unverifiable instead of a verdict.
        </p>

        <ul className="mt-7 flex flex-col">
          {UNVERIFIABLE_BY_REASON.map((row) => (
            <li
              key={row.reason}
              className="border-t py-4"
              style={{ borderColor: "var(--grid)" }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span style={{ color: "var(--ink)", fontSize: "15px" }}>{row.label}</span>
                <span className="t-num shrink-0" style={{ color: "var(--ink)" }}>
                  {percent(row.runs, CHECK_RUNS)}
                </span>
              </div>
              <p className="mt-1.5 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                {row.reason} · <span className="t-num">{row.runs}</span> of{" "}
                <span className="t-num">{CHECK_RUNS}</span>
              </p>
            </li>
          ))}
        </ul>

        <p
          className="mt-6 border-t pt-6"
          style={{
            borderColor: "var(--grid)",
            color: "var(--ink-dim)",
            fontSize: "14px",
            lineHeight: 1.65,
          }}
        >
          These figures come from the {PAPERS}-paper validation corpus, not from production
          traffic. The two checks that need no network were run across every paper in it. There is
          no production traffic: runs are held in memory today, and permalinks do not survive a
          restart. The same runs left <span className="t-num">{NOT_CHECKED_ENTRIES}</span>{" "}
          individual things not checked, each with a reason attached.
        </p>
        <p className="mt-3 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
          docs/ARCHITECTURE.md §15.5 · reproduce: src/components/site/corpus.ts
        </p>
      </div>
    </div>
  );
}
