import type {
  CheckResult,
  Finding,
  Provenance,
  ReasonCode,
  RunReport,
  Verdict,
} from "@/types/run-report";
import type { Mark } from "@/components/gutter/marks";
import { siglaFor } from "@/components/gutter/sigla";
import { provenanceOf } from "./provenance";

/**
 * The ledger's three display groups, and how the five stored verdicts map onto
 * them (UI_PLAN.md).
 *
 * §7 fixes the vocabulary at `matches`, `within tolerance`, `diverges`,
 * `unverifiable`, and the stored `Verdict` enum is frozen contract with
 * append-only storage behind it. Nothing here changes either: the five values
 * are stored and shown as they are, and only the *grouping* is a display
 * decision. A `within_tolerance` row sits under Verified and still prints its
 * delta, so the tolerance result is grouped, never hidden.
 *
 * There is deliberately no aggregate. No score, no percentage, no "12 of 19
 * passed". A single number over these three groups would be a verdict about the
 * paper as a whole, and no such verdict is computable from what the checkers
 * actually measured. Counts sit on the group headers, where they label something
 * a reader can go and look at.
 */

export type LedgerGroup = "discrepancy" | "unverifiable" | "verified";

/**
 * Order in the pane.
 *
 * UI_PLAN.md's wireframe sketches Discrepancy → Verified → Unverifiable. This
 * puts Unverifiable second instead, because §5.5 requires the "not checked"
 * material to be first-class and above the fold, and across the ten validated
 * papers there are zero discrepancies and a long Verified group — which would
 * push the honest half of the result hundreds of rows down the list. The
 * grouping itself is exactly as the plan specifies.
 */
export const GROUP_ORDER: LedgerGroup[] = ["discrepancy", "unverifiable", "verified"];

export const GROUP_LABEL: Record<LedgerGroup, string> = {
  discrepancy: "Discrepancy",
  unverifiable: "Unverifiable",
  verified: "Verified",
};

/** One line under each header, in the researcher's terms, not the system's. */
export const GROUP_BLURB: Record<LedgerGroup, string> = {
  discrepancy: "The paper's own numbers disagree with each other here.",
  unverifiable: "Read but not called. Each row says what stopped the check.",
  verified: "Recomputed from the paper's own values and agreed.",
};

export const GROUP_OF: Record<Verdict, LedgerGroup> = {
  matches: "verified",
  within_tolerance: "verified",
  diverges: "discrepancy",
  unverifiable: "unverifiable",
  not_attempted: "unverifiable",
};

export type LedgerRowData = {
  /** Unique within a report; the selection key shared with the gutter. */
  key: string;
  /**
   * Identity of the claim itself, for the `layoutId` a row animates on when it
   * moves between groups.
   *
   * UI_PLAN.md asks for `claim.content_hash`. `Claim` exists in the contract and
   * carries that hash, but `RunReport` does not ship claims — a report carries
   * `CheckResult` and `Finding` only — so there is no content hash on the wire
   * to key on. The anchor plus the checker is the closest stable stand-in: it is
   * the same claim, read by the same check, across re-runs. Swap this for
   * `content_hash` the day the contract carries it.
   */
  identity: string;
  /**
   * The apparatus mark, shown in the row's margin and in the other two panes.
   * Empty on a row the gutter derived rather than read off the report. It is
   * navigation and nothing else: not the key, not the identity, not a way to
   * match this row against the same row in another run.
   */
  siglum: string;
  group: LedgerGroup;
  verdict: Verdict;
  check: CheckResult;
  finding: Finding | null;
  reason: ReasonCode | null;
  provenance: Provenance;
  /** What the row is about, one line. */
  title: string;
  /** The paper's own words, when the claim is prose. Empty for a bare cell. */
  verbatim: string;
  /** Page and line, or table, row and column — as a reader would cite it. */
  locator: string;
  /** The anchor in the document pane, when the row has one. */
  domId: string | null;
  /** Extra sentence from a `not_checked` entry, when there is one. */
  detail: string;
};

export type LedgerItem =
  | { kind: "header"; group: LedgerGroup; count: number; key: string }
  | { kind: "row"; row: LedgerRowData; key: string }
  | { kind: "empty"; group: LedgerGroup; key: string };

function rowFromMark(mark: Mark): LedgerRowData {
  const { check, finding } = mark;
  return {
    key: mark.key,
    identity: `${mark.domId}:${check.checker}`,
    siglum: mark.siglum,
    group: GROUP_OF[mark.verdict],
    verdict: mark.verdict,
    check,
    finding,
    reason: mark.reason,
    provenance: provenanceOf(check),
    title: check.display_name || check.checker,
    verbatim: finding?.verbatim ?? "",
    locator: finding?.anchor.human_locator || mark.locator,
    domId: mark.domId,
    detail: finding ? "" : (check.description ?? ""),
  };
}

/**
 * Every row in the ledger, in the order it is drawn, with its group headers.
 *
 * Rows come from the same `Mark` list the gutter is built from, so a row and a
 * mark are always the same object seen twice — that is what makes the anchor
 * bidirectional without a second derivation to drift out of step.
 *
 * `not_checked` entries that name no table produce no mark, because there is
 * nowhere in the document to draw them. They are still rows: §5.5 is explicit
 * that this list is part of the result, and dropping an entry for want of
 * somewhere to point would hide exactly the thing the section exists to show.
 * Such a row simply has no `domId`, and clicking it scrolls nothing.
 *
 * Within each group, document order is preserved. The ledger is never sorted by
 * anything else: sorting breaks the correspondence with the paper, which is the
 * whole point of the two panes.
 */
export function buildLedger(report: RunReport, marks: Mark[]): LedgerItem[] {
  const rows = marks.map(rowFromMark);
  const sigla = siglaFor(report);

  const placed = new Set<number>();
  marks.forEach((m) => {
    const hit = /^not-checked#(\d+)$/.exec(m.key);
    if (hit) placed.add(Number(hit[1]));
  });

  (report.not_checked ?? []).forEach((item, i) => {
    if (placed.has(i)) return;
    const check: CheckResult = {
      checker: "not_checked",
      checker_version: "—",
      verdict: "not_attempted",
      reason: item.reason,
      display_name: item.what,
      description: item.detail || "",
    };
    rows.push({
      key: `not-checked-only#${i}`,
      identity: `not-checked:${item.what}`,
      // Same entry as the placed variant above, so the same mark: whether §5.5
      // could point this row at a table changes where it is drawn, not what it
      // is cited as.
      siglum: sigla.get(`not-checked-only#${i}`) ?? "",
      group: "unverifiable",
      verdict: "not_attempted",
      check,
      finding: null,
      reason: item.reason,
      provenance: provenanceOf(check),
      title: item.what,
      verbatim: "",
      locator: "",
      domId: null,
      detail: item.detail || "",
    });
  });

  const items: LedgerItem[] = [];
  GROUP_ORDER.forEach((group) => {
    const inGroup = rows.filter((r) => r.group === group);
    // Discrepancy keeps its header at zero. Every one of the ten validated
    // papers has none, so this is the normal case, and a group that silently
    // disappeared would read as a section that failed to load rather than as
    // the result it is. The other two groups are omitted when empty: a paper
    // with nothing unverifiable and a paper with nothing verified are both real
    // states, but neither is the answer the reader came for.
    if (inGroup.length === 0 && group !== "discrepancy") return;
    items.push({ kind: "header", group, count: inGroup.length, key: `header:${group}` });
    if (inGroup.length === 0) {
      items.push({ kind: "empty", group, key: `empty:${group}` });
      return;
    }
    inGroup.forEach((row) => items.push({ kind: "row", row, key: row.key }));
  });
  return items;
}

/** How many claims the ledger holds — rows only, headers excluded. */
export function countClaims(report: RunReport, marks: Mark[]): number {
  return buildLedger(report, marks).filter((item) => item.kind === "row").length;
}

export function groupCounts(items: LedgerItem[]): Record<LedgerGroup, number> {
  const out: Record<LedgerGroup, number> = { discrepancy: 0, unverifiable: 0, verified: 0 };
  items.forEach((item) => {
    if (item.kind === "row") out[item.row.group] += 1;
  });
  return out;
}
