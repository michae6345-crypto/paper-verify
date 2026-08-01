import type {
  CheckResult,
  Finding,
  NotChecked1,
  ReasonCode,
  RunReport,
  Table,
  Verdict,
} from "@/types/run-report";
import { VERDICT_RANK } from "@/lib/verdict";

/**
 * What the gutter is made of.
 *
 * A mark is one verdict pinned to one place in the document. `domId` is an
 * `Anchor.dom_id`, which is also the DOM id the document pane puts on the cell
 * or table — so a mark, a document highlight, and a verdict row are all keyed by
 * the same string (see `shell/gutter.tsx`).
 */
export type Mark = {
  /** Stable across renders; unique within a report. */
  key: string;
  domId: string;
  verdict: Verdict;
  /** The check this mark came from, for the verdict pane. */
  check: CheckResult;
  /** Present only for real findings. Derived marks (below) have none. */
  finding: Finding | null;
  /** Why this mark exists, in the checker's own terms. */
  reason: ReasonCode | null;
  /** One line, sentence case, for the tooltip and the screen reader. */
  locator: string;
  /** Document order: table index, then row, then column. */
  order: [number, number, number];
};

/**
 * How a mark is derived, and why the derived ones exist at all.
 *
 * The ten validated papers contain **zero** `diverges` and almost no findings.
 * A gutter drawn only from `Finding` objects would therefore be empty on every
 * real report, which would say — falsely — that there was nothing to look at.
 * The truth is the opposite: there is a lot to look at, and most of it is the
 * checker declining to judge. So marks come from three sources, in this order of
 * precedence per table:
 *
 *   1. **A finding.** Precise: it carries its own anchor, down to the cell.
 *   2. **A `not_checked` entry that names this table.** The label has to match as
 *      a whole token — `tab:main` must not match `tab:main_ablation`. If nothing
 *      matches, no mark: the entry still appears in the §5.5 list.
 *   3. **Otherwise, one mark per table carrying the weakest thing the run's
 *      checks can say about it.** A check that returned `unverifiable` or
 *      `not_attempted` could not speak for any table, so it contributes that.
 *      A check that produced findings but none here contributes `matches`: it
 *      read the paper and raised nothing on this table. The weakest contribution
 *      wins, by `VERDICT_RANK`.
 *
 * Rule 3 is the one that could go wrong in this codebase's recurring way — a
 * narrowing that turns into a confident claim. It is bounded so it cannot: it
 * never produces `diverges` or `within tolerance`, the two verdicts that accuse.
 * Those two are only ever carried by a finding, which has its own evidence
 * attached. The worst rule 3 can assert is that a check matched, and the mark
 * says which check said so.
 */

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token match, so `tab:main` does not match `tab:main_ablation`. */
function mentionsLabel(text: string, label: string): boolean {
  const re = new RegExp(`(^|[^A-Za-z0-9_:-])${escapeForRegex(label)}([^A-Za-z0-9_:-]|$)`);
  return re.test(text);
}

/**
 * The DOM id the document pane gives each table.
 *
 * `Anchor.dom_id` is the id, and the backend already disambiguates repeated
 * labels there — ResNet's source declares `tab:single` twice and the second
 * table's anchor is `tab:single-2`. The suffix below is a guard, not the normal
 * path: if two anchors ever did collide, `getElementById` would silently resolve
 * every mark on the second table to the first, and the gutter would point at the
 * wrong numbers with no sign that anything was wrong.
 */
export function tableDomIds(tables: Table[]): string[] {
  const used = new Set<string>();
  return tables.map((table, index) => {
    const base = table.anchor?.dom_id || table.label || `table-${index}`;
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    const unique = `${base}~${index}`;
    used.add(unique);
    return unique;
  });
}

export function cellDomId(tableId: string, row: number, col: number): string {
  return `${tableId}/r${row}/c${col}`;
}

/** Human table number, 1-based, as a reader would cite it. */
function tableNumber(index: number): string {
  return `Table ${index + 1}`;
}

function weakest(verdicts: Verdict[]): Verdict {
  return verdicts.reduce((a, b) => (VERDICT_RANK[b] < VERDICT_RANK[a] ? b : a));
}

function findingTableLabel(finding: Finding): string | null {
  return finding.anchor.table_label ?? null;
}

export function deriveMarks(report: RunReport): Mark[] {
  const tables = (report.tables ?? []).filter((t) => !t.is_nested);
  const checks = report.checks ?? [];
  const notChecked = report.not_checked ?? [];

  const ids = tableDomIds(tables);

  // Label → table, but only where the label picks out exactly one table. A paper
  // that declares `tab:single` twice gives us no way to know which one an anchor
  // means, so we place no mark rather than place it on a guess. The finding is
  // still listed in §5.5; it just has no position in the margin.
  // A set of indices, not a list: `label` and `anchor.dom_id` are usually the
  // same string for the same table, and counting it twice would make every
  // table look ambiguous.
  const byLabel = new Map<string, Set<number>>();
  tables.forEach((t, i) => {
    [t.label, t.anchor?.dom_id].forEach((key) => {
      if (!key) return;
      const set = byLabel.get(key) ?? new Set<number>();
      set.add(i);
      byLabel.set(key, set);
    });
  });
  const unique = (label: string): number => {
    const hits = byLabel.get(label);
    return hits && hits.size === 1 ? [...hits][0] : -1;
  };

  const marks: Mark[] = [];
  const tablesWithMarks = new Set<number>();

  // 1. Findings. These are the precise marks and they always win.
  checks.forEach((check) => {
    (check.findings ?? []).forEach((finding, i) => {
      const { anchor } = finding;
      const label = findingTableLabel(finding);
      const tableIndex = label != null ? unique(label) : -1;

      // A finding whose table is not in the report — or which points at prose
      // rather than a table — still becomes a mark. It has nothing in the
      // document to align to, so the gutter will not place it; but it must
      // still appear in §5.5 and in the verdict pane, because dropping a
      // finding for want of somewhere to draw it would hide the only thing
      // this product exists to show. Sorted after every real table.
      if (tableIndex !== -1) tablesWithMarks.add(tableIndex);
      const order: [number, number, number] =
        tableIndex === -1
          ? [tables.length, 0, marks.length]
          : [tableIndex, anchor.row ?? -1, anchor.col ?? -1];
      marks.push({
        key: `${check.checker}#${i}`,
        domId: anchor.dom_id,
        verdict: check.verdict,
        check,
        finding,
        reason: check.reason ?? null,
        locator:
          anchor.human_locator ||
          (tableIndex === -1
            ? anchor.dom_id
            : `${tableNumber(tableIndex)}, row ${anchor.row ?? 0}, column ${anchor.col ?? 0}`),
        order,
      });
    });
  });

  // 2. `not_checked` entries that name a table.
  notChecked.forEach((item: NotChecked1, i) => {
    const named = tables
      .map((t, at) => (t.label && mentionsLabel(item.what, t.label) ? at : -1))
      .filter((at) => at !== -1);
    // Ambiguous label, same as above: list it, do not place it.
    const hit = named.length === 1 ? named[0] : -1;
    if (hit === -1 || tablesWithMarks.has(hit)) return;
    tablesWithMarks.add(hit);
    marks.push({
      key: `not-checked#${i}`,
      domId: ids[hit],
      verdict: "not_attempted",
      // Synthesised so the verdict pane has something to name. It is not a
      // CheckResult the backend produced, and it carries no findings.
      check: {
        checker: "not_checked",
        checker_version: "—",
        verdict: "not_attempted",
        reason: item.reason,
        display_name: item.what,
        description: item.detail || "",
      },
      finding: null,
      reason: item.reason,
      locator: `${tableNumber(hit)}${tables[hit].label ? ` (${tables[hit].label})` : ""}`,
      order: [hit, -1, -1],
    });
  });

  // 3. Everything else: one mark per table, carrying the weakest claim.
  tables.forEach((table, i) => {
    if (tablesWithMarks.has(i)) return;
    const contributions: { verdict: Verdict; check: CheckResult }[] = checks
      // `not_attempted` contributes nothing. It means the check never ran on
      // anything — the Transformer has no average columns for check 3 to add up
      // — so it holds no opinion about this table or any other. Letting it
      // contribute would mark every table in that paper "not checked" while
      // another check had in fact read them all and matched, which understates
      // the run as badly as the opposite error overstates it. `unverifiable` is
      // different and does contribute: the check tried here and could not say.
      .filter((check) => check.verdict !== "not_attempted")
      .map((check) => ({
        check,
        verdict: check.verdict === "unverifiable" ? "unverifiable" : ("matches" as Verdict),
      }));
    // Nothing ran that could speak about tables, so there is nothing to mark.
    if (contributions.length === 0) return;

    const verdict = weakest(contributions.map((c) => c.verdict));
    const source = contributions.find((c) => c.verdict === verdict)!;
    marks.push({
      key: `table#${i}`,
      domId: ids[i],
      verdict,
      check: source.check,
      finding: null,
      reason: source.check.reason ?? null,
      locator: `${tableNumber(i)}${table.label ? ` (${table.label})` : ""}`,
      order: [i, -1, -1],
    });
  });

  // Document order, so j/k walks the paper the way the eye does.
  return marks.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
    }
    return a.key.localeCompare(b.key);
  });
}

/** Marks that belong to one table, for the sub-760px inline presentation. */
export function marksByTable(marks: Mark[]): Map<number, Mark[]> {
  const out = new Map<number, Mark[]>();
  marks.forEach((m) => {
    const list = out.get(m.order[0]) ?? [];
    list.push(m);
    out.set(m.order[0], list);
  });
  return out;
}
