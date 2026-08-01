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
 * §16 §5.
 *
 * §16 asks for the live `unverifiable_rate_by_reason` figure from production.
 * There is no production: persistence is in memory and permalinks 404. The
 * honest substitute is the same metric computed over the committed corpus, said
 * in those words. Claiming production traffic on the honesty section would be
 * self-refuting.
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
    <div className="mt-10 grid gap-10 three:grid-cols-[1fr_420px] three:gap-12">
      <div>
        <h3 className="t-label">What this cannot check</h3>
        <ul className="mt-4 flex flex-col">
          {CANNOT.map((row) => (
            <li
              key={row.what}
              className="border-t py-4 first:border-t-0 first:pt-0"
              style={{ borderColor: "var(--chrome-line)" }}
            >
              <p style={{ color: "var(--chrome-text)", fontSize: "15px", lineHeight: 1.5 }}>
                {row.what}
              </p>
              <p
                className="mt-1.5 max-w-[68ch]"
                style={{ color: "var(--chrome-faint)", fontSize: "14px", lineHeight: 1.55 }}
              >
                {row.because}
              </p>
            </li>
          ))}
        </ul>

        <div
          className="mt-8 border p-5"
          style={{
            borderColor: "var(--chrome-line)",
            background: "var(--chrome-panel)",
            borderRadius: "var(--radius-panel)",
          }}
        >
          <div className="flex items-center gap-2">
            <VerdictGlyph verdict="unverifiable" size={12} />
            <h3 className="t-panel-title" style={{ color: "var(--chrome-text)" }}>
              What declining looks like
            </h3>
          </div>
          <p
            className="mt-2 max-w-[70ch]"
            style={{ color: "var(--chrome-dim)", fontSize: "14px", lineHeight: 1.55 }}
          >
            The Vision Transformer paper states a mean of 77.6 where the unweighted mean of the
            printed row is 74.450. That gap is large. We still do not call it a divergence, because
            nothing in the paper says which columns the mean covers, and averaging a subset of them
            gives the stated figure. The comparison is attached as evidence anyway. You see the
            numbers; we decline to draw the conclusion.
          </p>
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--chrome-line)" }}>
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
          <p className="mt-4 t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
            measured: fixtures/papers/2010.11929, network-free run
          </p>
        </div>
      </div>

      <div>
        <h3 className="t-label">Unverifiable rate, by reason</h3>

        <p
          className="mt-4"
          style={{ color: "var(--chrome-dim)", fontSize: "15px", lineHeight: 1.6 }}
        >
          <span className="t-num" style={{ fontSize: "15px" }}>
            {UNVERIFIABLE_RUNS}
          </span>{" "}
          of{" "}
          <span className="t-num" style={{ fontSize: "15px" }}>
            {CHECK_RUNS}
          </span>{" "}
          check runs (
          <span className="t-num" style={{ fontSize: "15px", color: "var(--v-unverifiable)" }}>
            {percent(UNVERIFIABLE_RUNS, CHECK_RUNS)}
          </span>
          ) returned unverifiable instead of a verdict.
        </p>

        <ul className="mt-6 flex flex-col gap-4">
          {UNVERIFIABLE_BY_REASON.map((row) => (
            <li key={row.reason}>
              <div className="flex items-baseline justify-between gap-4">
                <span style={{ color: "var(--chrome-text)", fontSize: "14px" }}>{row.label}</span>
                <span className="t-num shrink-0" style={{ color: "var(--chrome-dim)" }}>
                  {percent(row.runs, CHECK_RUNS)}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 w-full"
                style={{ background: "var(--chrome-raised)", borderRadius: "1px" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: percent(row.runs, CHECK_RUNS),
                    background: "var(--v-unverifiable)",
                    borderRadius: "1px",
                  }}
                />
              </div>
              <p className="mt-1.5 t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
                {row.reason} · <span className="t-num">{row.runs}</span> of{" "}
                <span className="t-num">{CHECK_RUNS}</span>
              </p>
            </li>
          ))}
        </ul>

        <p
          className="mt-8 border-t pt-5"
          style={{
            borderColor: "var(--chrome-line)",
            color: "var(--chrome-faint)",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          These figures come from the {PAPERS}-paper validation corpus, not from production
          traffic. The two checks that need no network were run across every paper in it. There is
          no production traffic: runs are held in memory today, and permalinks do not survive a
          restart. The same runs left <span className="t-num">{NOT_CHECKED_ENTRIES}</span>{" "}
          individual things not checked, each with a reason attached.
        </p>
        <p className="mt-3 t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
          docs/ARCHITECTURE.md §15.5 · reproduce: src/components/site/corpus.ts
        </p>
      </div>
    </div>
  );
}
