import { VERDICT_LABEL } from "@/lib/verdict";

import type { HeroCard, HeroStage } from "./hero-scene";
import { checkFrom, findingFrom, reportById } from "./corpus.server";

/**
 * What the hero shows, read out of the corpus at build time. Server-side only.
 *
 * The stage names are `backend/pv/orchestrator.py`'s own, in its own order. The
 * lines under them are the artifacts those stages produce, and the three that
 * could drift — the table count, the two check verdicts — are read from the
 * committed report rather than typed here, so a checker whose output changes
 * changes this page too instead of leaving a stale claim on it.
 *
 * `awaiting_artifact`, `planning` and `complete` are real stages and are not
 * drawn. Five marks on a spine is a diagram; eight is a schematic, and the full
 * state machine is a click away in the how-it-works section, which is the honest
 * place for it.
 */

const PAPER = "1810.04805";

/** The one thing that never fits: a name and its verdict on one narrow line. */
function pair(name: string, verdict: string): string[] {
  return [name, `  ${verdict}`];
}

export function heroStages(): HeroStage[] {
  const report = reportById(PAPER);
  const bold = checkFrom(PAPER, "bold_extreme");
  const arith = checkFrom(PAPER, "row_arithmetic");

  return [
    {
      name: "resolving",
      artifact: ["e-print/1810.04805", "cached tarball", "1 request / 3s"],
    },
    {
      name: "extracting",
      artifact: [
        "\\input resolved",
        "macros expanded",
        `${report?.tables_parsed ?? 8} tables parsed`,
      ],
    },
    {
      name: "mining",
      artifact: ["1 claim per valued cell", "sha256 content hash"],
    },
    {
      name: "checking",
      artifact: [
        ...pair("bold_extreme", bold ? VERDICT_LABEL[bold.verdict] : "not checked"),
        ...pair("row_arithmetic", arith ? VERDICT_LABEL[arith.verdict] : "not checked"),
      ],
    },
    {
      name: "adjudicating",
      artifact: ["tolerance.yaml v1", "rule reported_precision"],
    },
  ];
}

export function heroCard(): HeroCard {
  const check = checkFrom(PAPER, "row_arithmetic");
  const finding = findingFrom(PAPER, "row_arithmetic");

  return {
    locator: `${PAPER}  ${finding?.anchor.dom_id ?? "tab:glue_official/r3/c9"}`,
    claimed: finding?.claimed ?? "71.0",
    computed: finding?.computed ?? "70.944",
    delta: finding?.delta ?? "+0.056",
    verdict: check?.verdict ?? "within_tolerance",
    source: `fixtures/reports/${PAPER}.json`,
  };
}
