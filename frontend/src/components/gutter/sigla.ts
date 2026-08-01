import type { RunReport } from "@/types/run-report";

/**
 * Sigla: the short marks that let a reader follow one claim across four surfaces.
 *
 * The same mark appears in the document pane, on the ledger row, in the gutter,
 * and — once it exists — in the exported PDF. That is the whole point of it, and
 * it is the signature element of DESIGN_PLAN.md's apparatus.
 *
 * NAVIGATION, NOT IDENTITY. Assignment is positional, so re-running a paper after
 * the parser changes can move which finding is `c`. A siglum is therefore never a
 * React key, never a selection key, and never used to match a row across two runs.
 * `CheckResult.fingerprint` is what survives a version bump; this survives one
 * reading of one report.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/**
 * 0 -> a, 25 -> z, 26 -> aa, 27 -> ab.
 *
 * Bijective base-26, so there is no `a` that also means `aa` and no gap at 26.
 * This is a line-for-line mirror of `backend/pv/siglum.py`'s `nth`, and it has to
 * stay one: the marks a reader sees here and the marks the export prints must be
 * the same marks, or the siglum is worse than no siglum at all.
 */
export function nth(index: number): string {
  if (index < 0) throw new RangeError("siglum index must be non-negative");
  let out = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    n = Math.floor((n - 1) / 26);
    out = ALPHABET[rem] + out;
  }
  return out;
}

/**
 * Every siglum in a report, keyed by the mark key the two panes already share.
 *
 * `Finding.siglum` and `NotChecked.siglum` are contract fields and win whenever
 * they carry a value. The positional fallback below exists because the runner
 * does not yet call `pv.siglum.assign`, so today's fixtures ship the field empty
 * — see the final report. The fallback walks the report in exactly the order
 * `assign` does (each check's findings in order, then the `not_checked` list), so
 * it produces the marks the backend will produce, and the day the runner assigns
 * them nothing here changes.
 *
 * Only contract entities get a mark. The gutter also derives one mark per table
 * for tables no finding touched (rule 3 in `marks.ts`); those are a presentation
 * device with no identity in the report, and inventing an apparatus entry for one
 * would put a mark on screen that the exported PDF could never cite. Their margin
 * slot stays empty, which is what an apparatus does with an unremarked reading.
 */
export function siglaFor(report: RunReport): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;

  (report.checks ?? []).forEach((check) => {
    (check.findings ?? []).forEach((finding, at) => {
      out.set(`${check.checker}#${at}`, finding.siglum || nth(i));
      i += 1;
    });
  });

  (report.not_checked ?? []).forEach((entry, at) => {
    const mark = entry.siglum || nth(i);
    i += 1;
    // A `not_checked` entry becomes one of two rows depending on whether its
    // `what` named a table the gutter could place it on. It is the same entry
    // either way, so it carries the same mark under both keys.
    out.set(`not-checked#${at}`, mark);
    out.set(`not-checked-only#${at}`, mark);
  });

  return out;
}
