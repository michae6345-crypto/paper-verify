import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

import {
  CHECK_RUNS,
  NOT_CHECKED_ENTRIES,
  PAPERS,
  UNVERIFIABLE_BY_REASON,
  UNVERIFIABLE_RUNS,
  percent,
} from "./corpus";
import { Output, Siglum } from "./section";

/**
 * What residual reads, how it decides, and where the boundary is — in that
 * order.
 *
 * The order is the change. This section used to open on a list of five things
 * the checker cannot do, which is true, is the product's argument, and is a
 * strange first thing to say. The same five sentences are still here, unedited,
 * at the bottom, under a heading that says what they are: the boundary of the
 * method, not a list of failures.
 *
 * Nothing was softened to make the move. No figure changed, nothing became a
 * promise, and the paragraph that says these numbers come from a ten-paper
 * corpus rather than from production traffic is still the last word in the
 * column, because claiming production numbers here would refute the section.
 */

/** The four kinds of claim a run mines out of a paper. */
const READS: { what: string; how: string }[] = [
  {
    what: "The LaTeX source, not the PDF",
    how: "Fetched from arXiv's e-print endpoint, \\input files joined into one document, author macros expanded before anything is parsed.",
  },
  {
    what: "Every table cell that holds a value",
    how: "One claim per cell, with its column, its rule-delimited block, and a content hash — so a verdict can be replayed against exactly the claim that produced it.",
  },
  {
    what: "Every URL the paper prints",
    how: "Requested once, and reported only when the server itself says the resource is gone.",
  },
  {
    what: "Every bibliography entry",
    how: "Looked up in Crossref and OpenAlex by identifier, never by matching titles for containment.",
  },
];

/** The rules that turn a reading into a verdict. All four are arithmetic. */
const DECIDES: { siglum: string; rule: string; detail: string }[] = [
  {
    siglum: "a",
    rule: "A bolded value is compared inside its own block, never against the whole column",
    detail:
      "Tables are segmented by their rules. A column with two bolded values usually has two blocks, and comparing across them reports a divergence that is not there. If a single block still holds two, the answer is unverifiable rather than a guess at which one was meant.",
  },
  {
    siglum: "b",
    rule: "A metric's direction comes from the header, then from a curated list, then from nowhere",
    detail:
      "An arrow in the column header first, because that is the convention authors already use. A lookup table of known metrics second — perplexity, FID, WER, error rate are lower-is-better. If neither settles it, the check declines: bolding the smallest number is correct exactly as often as it is wrong.",
  },
  {
    siglum: "c",
    rule: "How close counts as equal is read from a versioned policy file, not decided in a checker",
    detail:
      "policies/tolerance.yaml holds the band, and every stored result names the policy version that judged it. Revising the band publicly means replaying stored observations rather than re-accusing anyone.",
  },
  {
    siglum: "d",
    rule: "Anything a step had to discard makes the result unverifiable, with the reason attached",
    detail:
      "Whenever a step narrows or normalises the source, the question is what it threw away and whether a verdict could rest on it. If it could, the comparison is still shown — you see both numbers — and we decline to draw the conclusion from them.",
  },
];

/** The boundary of the method. Unedited; moved, and named for what it is. */
const BOUNDARY: { what: string; because: string }[] = [
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

export function Decision() {
  return (
    <>
      <div className="mt-20 grid gap-16 three:grid-cols-[minmax(0,1fr)_360px] three:gap-20">
        <div className="min-w-0">
          <h3
            className="t-num"
            style={{
              color: "var(--mark)",
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            What it reads
          </h3>

          <ul className="mt-8 flex flex-col">
            {READS.map((row) => (
              <li
                key={row.what}
                className="border-t py-6 first:border-t-0 first:pt-0"
                style={{ borderColor: "var(--grid)" }}
              >
                <p style={{ color: "var(--ink)", fontSize: "17px", lineHeight: 1.45 }}>
                  {row.what}
                </p>
                <p
                  className="mt-2.5 max-w-[62ch]"
                  style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.7 }}
                >
                  {row.how}
                </p>
              </li>
            ))}
          </ul>

          <h3
            className="mt-20 t-num"
            style={{
              color: "var(--mark)",
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            How it decides
          </h3>

          <ul className="mt-8 flex flex-col">
            {DECIDES.map((row) => (
              <li
                key={row.siglum}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 border-t py-7 two:grid-cols-[36px_minmax(0,1fr)] two:gap-x-6"
                style={{ borderColor: "var(--grid)" }}
              >
                <div className="pt-0.5">
                  <Siglum mark={row.siglum} />
                </div>
                <div className="min-w-0">
                  <p
                    className="max-w-[52ch]"
                    style={{
                      fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
                      color: "var(--ink)",
                      fontSize: "20px",
                      lineHeight: 1.35,
                    }}
                  >
                    {row.rule}
                  </p>
                  <p
                    className="mt-3 max-w-[62ch]"
                    style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.7 }}
                  >
                    {row.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-20 border-t pt-10" style={{ borderColor: "var(--grid)" }}>
            <div className="flex items-center gap-2.5">
              <VerdictGlyph verdict="unverifiable" size={12} />
              <h3 className="t-num" style={{ color: "var(--ink)", fontSize: "15px" }}>
                What declining looks like
              </h3>
            </div>
            <p
              className="mt-4 max-w-[62ch]"
              style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.7 }}
            >
              The Vision Transformer paper states a mean of 77.6 where the unweighted mean of the
              printed row is 74.450. That gap is large. We still do not call it a divergence,
              because nothing in the paper says which columns the mean covers, and averaging a
              subset of them gives the stated figure. The comparison is attached as evidence anyway.
              You see the numbers; we decline to draw the conclusion.
            </p>
            <div
              className="mt-6 border-l py-1 pl-6"
              style={{ borderColor: "var(--grid)" }}
            >
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
            <p className="mt-6 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
              measured: fixtures/papers/2010.11929, network-free run
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <h3
            className="t-num"
            style={{
              color: "var(--mark)",
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            How often it declines
          </h3>

          <p className="mt-8" style={{ color: "var(--ink)", fontSize: "17px", lineHeight: 1.65 }}>
            <span className="t-num" style={{ fontSize: "17px" }}>
              {UNVERIFIABLE_RUNS}
            </span>{" "}
            of{" "}
            <span className="t-num" style={{ fontSize: "17px" }}>
              {CHECK_RUNS}
            </span>{" "}
            check runs returned unverifiable instead of a verdict.
          </p>

          <ul className="mt-9 flex flex-col">
            {UNVERIFIABLE_BY_REASON.map((row) => (
              <li key={row.reason} className="border-t py-5" style={{ borderColor: "var(--grid)" }}>
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
            className="mt-8 border-t pt-8"
            style={{
              borderColor: "var(--grid)",
              color: "var(--ink-dim)",
              fontSize: "14px",
              lineHeight: 1.7,
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

      {/* The boundary, last. Same five sentences as before, unedited. */}
      <div className="mt-24 border-t pt-12" style={{ borderColor: "var(--grid)" }}>
        <h3
          className="t-num"
          style={{
            color: "var(--mark)",
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Where the boundary is
        </h3>
        <p
          className="mt-8 max-w-[56ch]"
          style={{ color: "var(--ink-dim)", fontSize: "16px", lineHeight: 1.7 }}
        >
          The method has edges, and they are worth stating plainly, because a tool that answers
          every question is a tool that is guessing at some of them.
        </p>

        <ul className="mt-10 grid gap-x-16 gap-y-0 three:grid-cols-2">
          {BOUNDARY.map((row) => (
            <li key={row.what} className="border-t py-6" style={{ borderColor: "var(--grid)" }}>
              <p
                style={{
                  fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
                  color: "var(--ink)",
                  fontSize: "18px",
                  lineHeight: 1.4,
                }}
              >
                {row.what}
              </p>
              <p
                className="mt-2.5 max-w-[54ch]"
                style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.7 }}
              >
                {row.because}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
