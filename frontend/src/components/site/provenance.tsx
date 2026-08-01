import {
  CAUGHT_BEFORE_SHIPPING,
  CELLS,
  CHECK_RUNS,
  CORPUS_FINDINGS,
  FALSE_FINDINGS,
  NOT_CHECKED_ENTRIES,
  PAPERS,
  TABLES,
  TESTS,
} from "./corpus";

/**
 * Every number this page states, and where it came from.
 *
 * This replaces the row of large counters the first draft had. UI_PLAN.md
 * already cut that from the report for a specific reason — a row of big numbers
 * above a verification result is one reading away from a score, and the brief
 * forbids scores — and the same argument applies on a landing page, where it
 * would read as a quality rating of the papers in the corpus.
 *
 * So the numbers stay and the wall goes. What is left is the thing a reader
 * checking us would actually want: the figure, and the command or file that
 * reproduces it. `src/components/site/corpus.ts` carries the full recipe for
 * each one.
 */

const ROWS: { value: string; what: string; source: string }[] = [
  { value: String(PAPERS), what: "papers in the validation corpus", source: "fixtures/papers/" },
  {
    value: String(TABLES),
    what: "tables holding data",
    source: "parsed; the 10 nested tabulars are excluded",
  },
  {
    value: CELLS.toLocaleString("en-US"),
    what: "cells parsed",
    source: "across all 113 tabulars, nested included",
  },
  { value: String(CHECK_RUNS), what: "check runs measured", source: "2 network-free checks × 10 papers" },
  { value: String(CORPUS_FINDINGS), what: "findings the corpus produced", source: "1 within tolerance, 3 unverifiable" },
  {
    value: String(NOT_CHECKED_ENTRIES),
    what: "things declined, each with a reason attached",
    source: "RunReport.not_checked, summed over the corpus",
  },
  { value: String(TESTS), what: "tests, none touching the network", source: "pytest --collect-only" },
  {
    value: String(CAUGHT_BEFORE_SHIPPING),
    what: "lossy readings caught before shipping",
    source: "README.md, what the corpus taught us",
  },
  {
    value: String(FALSE_FINDINGS),
    what: "findings the ground truth says we should not have made",
    source: "fixtures/GROUND_TRUTH.md",
  },
];

export function Provenance() {
  return (
    <>
      <ul className="mt-12 flex flex-col">
        {ROWS.map((row) => (
          <li
            key={row.what}
            className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-x-5 gap-y-1 border-t py-4 two:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)] two:gap-x-8"
            style={{ borderColor: "var(--grid)" }}
          >
            <span
              className="t-num text-right"
              style={{ color: "var(--ink)", fontSize: "20px", lineHeight: 1.2 }}
            >
              {row.value}
            </span>
            <span style={{ color: "var(--ink)", fontSize: "15px", lineHeight: 1.45 }}>
              {row.what}
            </span>
            <span
              className="t-num col-start-2 two:col-start-3"
              style={{ color: "var(--mark)", fontSize: "11px", lineHeight: 1.5 }}
            >
              {row.source}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
        src/components/site/corpus.ts carries the command that reproduces each row
      </p>
    </>
  );
}
