/**
 * Every number the marketing site states, and where it comes from.
 *
 * Nothing here is estimated, rounded up, or projected. Two provenance classes:
 *
 *   committed   Read at build time from `fixtures/reports/*.json` via
 *               `@/lib/reports`. Not in this file at all — see `corpus.server.ts`.
 *
 *   measured    Produced by running the committed checker over the committed
 *               ten-paper corpus, with no network. Recorded here because the
 *               site cannot run Python at build time. Every entry below carries
 *               the command that reproduces it; if the checker changes, these
 *               change, and the CI corpus gate (ARCHITECTURE §15.3) is what
 *               catches the drift.
 *
 * Reproduce the corpus measurements:
 *
 *   cd backend && python - <<'PY'
 *   from pathlib import Path
 *   from pv.run import run_paper
 *   for p in sorted(Path('../fixtures/papers').iterdir()):
 *       if p.is_dir():
 *           r = run_paper(p.name, from_directory=str(p),
 *                         checks=('bold_extreme', 'row_arithmetic'),
 *                         allow_network=False)
 *           print(p.name, [(c.checker, c.verdict, c.reason) for c in r.checks],
 *                 len(r.not_checked))
 *   PY
 *
 * Reproduce the table and cell counts:
 *
 *   cd backend && python - <<'PY'
 *   from pathlib import Path
 *   from pv.ingest import ingest_directory
 *   from pv.parse import parse_document
 *   t = c = 0
 *   for p in sorted(Path('../fixtures/papers').iterdir()):
 *       if not p.is_dir(): continue
 *       tables = parse_document(ingest_directory(p).document)
 *       real = [x for x in tables if not x.is_nested]
 *       t += len(real); c += sum(len(x.cells) for x in tables)
 *   print(t, c)
 *   PY
 *
 * The two checks measured here are the ones that need no network. `dead_links`
 * and `citation_existence` are excluded from the corpus figures for exactly that
 * reason, and the site says so rather than quietly folding them in.
 */

/** Papers in `fixtures/papers/`. */
export const PAPERS = 10;

/**
 * Tabulars that hold data, across the corpus. Excludes the 10 nested tabulars
 * used as line-break helpers inside another table's cell — `run.py` drops those
 * before the checks see them, so counting them would overstate the work.
 */
export const TABLES = 103;

/**
 * Cells in the 103 tables above.
 *
 * This was 7034, counted across all 113 tabulars with the nested ones included.
 * That figure was true when it was measured and became wrong when `is_nested`
 * landed and the runner stopped passing layout tabulars to the checks. The
 * comment describing it stayed accurate while the page stopped being: a reader
 * sees "103 tables" and "7,034 cells" together and reads the second as counting
 * the first.
 *
 * Both numbers now describe the same set of tables.
 */
export const CELLS = 7014;

/**
 * Tests passing at the commit this site was built from. A snapshot, and it goes
 * stale on the next commit, so do not lead with it.
 */
export const TESTS = 645;

/**
 * Findings on the corpus that the ground truth says should not exist.
 * `fixtures/GROUND_TRUTH.md` enumerates six false positives caught in
 * development; none of them survive in the current checker.
 */
export const FALSE_FINDINGS = 0;

/** Named in `README.md` — six lossy readings caught before shipping. */
export const CAUGHT_BEFORE_SHIPPING = 6;

/** 2 network-free checks over 10 papers. */
export const CHECK_RUNS = 20;

export const VERDICT_COUNTS = {
  matches: 8,
  within_tolerance: 1,
  unverifiable: 9,
  not_attempted: 2,
} as const;

/**
 * The §15.5 `unverifiable_rate_by_reason` metric, computed over the corpus
 * rather than over production traffic — there is no production traffic. The
 * site labels it that way.
 */
export const UNVERIFIABLE_BY_REASON: { reason: string; label: string; runs: number }[] = [
  { reason: "table_structure_not_parsed", label: "Table structure not parsed", runs: 7 },
  { reason: "multiple_bold_in_column", label: "More than one bolded value in the column", runs: 1 },
  { reason: "no_numeric_values", label: "No numbers to compare", runs: 1 },
];

export const UNVERIFIABLE_RUNS = 9;

/** Individual things the runs declined to check, with a reason attached to each. */
export const NOT_CHECKED_ENTRIES = 32;

/** Findings the corpus produced. One within tolerance, three unverifiable. */
export const CORPUS_FINDINGS = 4;

export function percent(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}
