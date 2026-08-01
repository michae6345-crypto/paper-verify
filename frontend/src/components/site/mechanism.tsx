"use client";

import { useState } from "react";

import { Output, Siglum } from "./section";

/**
 * The §14.2 run state machine, with the artifact each stage produces.
 *
 * The timeline advances when the visitor moves through it, not when the page
 * does: §6 forbids animating on scroll, and the site's one moment is the ledger
 * in the hero. Selection is a 120ms colour and border change and nothing else.
 *
 * **All eight stages below are implemented in `backend/pv/orchestrator.py`.**
 * This page said otherwise until 2026-08-01, and the correction matters more
 * than the rest of the page: `mining` was marked "specified, not written" on the
 * strength of `ARCHITECTURE.md` §14.0, which recorded that `Claim` had no call
 * sites. It had none when that sentence was written and it has thirty-nine
 * edges across eight files now — `docs/GRAPH_FINDINGS.md` §1 is the count.
 * `adjudicating` was wrong the same way: `policies/tolerance.yaml` is committed
 * and all four checkers read it, so the claim that the band still lived inside
 * `row_arithmetic.py` was stale too.
 *
 * `planning` is the one stage that runs while doing less than it is specified to
 * do, and it says so. A page whose argument is that we do not publish claims we
 * cannot support cannot carry a stale claim about itself in either direction.
 */

type State = "built" | "narrower" | "specified";

const STATE_LABEL: Record<State, string> = {
  built: "runs today",
  narrower: "runs, narrower than specified",
  specified: "specified, not written",
};

type Stage = {
  id: string;
  name: string;
  state: State;
  summary: string;
  artifact: string[];
  source: string;
};

const STAGES: Stage[] = [
  {
    id: "resolving",
    name: "resolving",
    state: "built",
    summary:
      "Fetches the paper's LaTeX source from arXiv, one request every three seconds, and caches the tarball so the same paper is never fetched twice.",
    artifact: [
      "GET https://arxiv.org/e-print/1706.03762",
      "cache      .arxivcache/1706.03762",
      "source     73,921 characters of LaTeX",
      "hash       7be63bc2dbc3a458…",
    ],
    source: "backend/pv/ingest/fetch.py",
  },
  {
    id: "extracting",
    name: "extracting",
    state: "built",
    summary:
      "Joins the \\input files into one document, expands the macros the author defined, then parses each tabular into cells, columns, and rule-delimited blocks.",
    artifact: [
      "files      8   ms.tex, introduction.tex, background.tex,",
      "               model_architecture.tex, why_self_attention.tex,",
      "               training.tex, results.tex, visualizations.tex",
      "macros     16  \\dmodel  \\dff  \\mbf …",
      "tables     4   with bold, blocks and column direction",
    ],
    source: "backend/pv/ingest/assemble.py · backend/pv/parse/",
  },
  {
    id: "mining",
    name: "mining",
    state: "built",
    summary:
      "Turns the parsed document into claims: one per table cell holding a value, one per URL, one per bibliography entry. Each carries a content hash, so a verdict can be replayed against exactly the claim that produced it.",
    artifact: [
      "content_hash = sha256(kind, anchor.dom_id, verbatim, value)",
      "",
      "mine()                 -> body_number + link + citation",
      "mine_body_numbers()    -> one claim per valued cell",
      "mine_links()           -> one claim per URL",
      "mine_citations()       -> one claim per bibliography entry",
      "",
      "Claim carries 39 edges across 8 files: the four checkers,",
      "checks/_cells.py, the registry and the orchestrator.",
    ],
    source: "backend/pv/claims/mine.py · docs/GRAPH_FINDINGS.md §1",
  },
  {
    id: "awaiting_artifact",
    name: "awaiting artifact",
    state: "built",
    summary:
      "Waits for you to confirm which repository belongs to the paper, for at most ten minutes. On expiry the run continues without one and the code-dependent checks resolve unverifiable.",
    artifact: [
      "timeout    10 minutes, then artifact = None",
      "result     unverifiable / no_code_repository",
      "",
      "A paper with no repository candidates never enters the",
      "wait at all: there is no question to put to anyone.",
      "A run must never block indefinitely on a human.",
    ],
    source: "backend/pv/orchestrator.py · docs/BRIEF.md §5.2",
  },
  {
    id: "planning",
    name: "planning",
    state: "narrower",
    summary:
      "Resolves the list of checks the run will execute, so a check whose module is missing produces a row saying so instead of silently disappearing. It does not yet ask each checker which claims it applies to: that filtering happens inside each check rather than here.",
    artifact: [
      "state.plan = list(options.checks)",
      "registry.discover(names)  -> one entry per name, always",
      "",
      "Specified: applies(claim, ctx) -> bool, resolved here.",
      "Actual:    each check calls applies() on its own claims.",
      "",
      "A missing checker module produces",
      "not_attempted / checker_error — never nothing.",
    ],
    source: "backend/pv/orchestrator.py · docs/ARCHITECTURE.md §14.3, §14.7",
  },
  {
    id: "checking",
    name: "checking",
    state: "built",
    summary:
      "Runs every check under a wall-clock budget. A check that raises is recorded as unverifiable with the reason, and the run carries on. One failing check never takes the report down.",
    artifact: [
      "1706.03762",
      "",
      "bold_extreme        1.0.0   matches",
      "row_arithmetic      1.0.0   not attempted   no_applicable_claims",
      "dead_links          1.0.0   matches",
      "citation_existence  1.0.0   unverifiable    reference_not_indexed",
    ],
    source: "backend/pv/checks/registry.py · README.md, recorded CLI run",
  },
  {
    id: "adjudicating",
    name: "adjudicating",
    state: "built",
    summary:
      "Separates what a checker measured from what the system concludes. The tolerance band lives in a versioned policy file rather than inside a checker, so revising it publicly means replaying stored observations instead of re-accusing everyone.",
    artifact: [
      "# policies/tolerance.yaml   version: 1",
      "default:",
      "  rule: reported_precision   # 87.4 carries an implicit ±0.05",
      "metrics:",
      "  bleu: {rule: reported_precision, min_abs: 0.05}",
      "",
      "Every stored CheckResult names the policy that judged it,",
      "so a revision appends rows and never edits old ones.",
    ],
    source: "policies/tolerance.yaml · backend/pv/adjudicate.py",
  },
  {
    id: "complete",
    name: "complete or partial",
    state: "built",
    summary:
      "Assembles the report, including the list of everything the run could not check and why. A run with six of eleven checks complete is a valid result, not a failure.",
    artifact: [
      "1706.03762   4 tables parsed",
      "",
      "  —  Bolded value is the best in its block   matches",
      "  ·  Average columns match their row         not checked",
      "  —  Dead links                              matches",
      "  ○  Citation existence                      unverifiable",
      "",
      "Not checked (2)",
    ],
    source: "backend/pv/run.py · README.md",
  },
];

const SIGLA = "abcdefgh";

export function Mechanism() {
  const [selected, setSelected] = useState("mining");
  const stage = STAGES.find((s) => s.id === selected) ?? STAGES[0];

  return (
    <div className="mt-14 grid gap-8 three:grid-cols-[280px_minmax(0,1fr)] three:gap-12">
      <ol className="flex flex-col" aria-label="Run stages">
        {STAGES.map((s, i) => {
          const active = s.id === stage.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                aria-current={active ? "step" : undefined}
                className="flex w-full items-baseline gap-3 border-b py-2.5 text-left transition-colors"
                style={{
                  borderColor: "var(--grid)",
                  color: active ? "var(--ink)" : "var(--ink-dim)",
                  transitionDuration: "var(--dur-fast)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="t-num w-3 shrink-0"
                  style={{ color: active ? "var(--ink)" : "var(--mark)", fontSize: "11px" }}
                >
                  {SIGLA[i]}
                </span>
                <span className="t-num flex-1" style={{ fontSize: "14px" }}>
                  {s.name}
                </span>
                {s.state !== "built" && (
                  <span
                    className="shrink-0 whitespace-nowrap"
                    style={{ color: "var(--mark)", fontSize: "11px" }}
                  >
                    {s.state === "narrower" ? "partial" : "not built"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Siglum mark={SIGLA[STAGES.indexOf(stage)]} />
          <h3 className="t-num" style={{ color: "var(--ink)", fontSize: "17px" }}>
            {stage.name}
          </h3>
          <span style={{ color: "var(--ink-dim)", fontSize: "13px" }}>
            {STATE_LABEL[stage.state]}
          </span>
        </div>

        <p
          className="mt-4 max-w-[66ch]"
          style={{ color: "var(--ink-dim)", fontSize: "16px", lineHeight: 1.6 }}
        >
          {stage.summary}
        </p>

        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--grid)" }}>
          <Output>{stage.artifact.join("\n")}</Output>
        </div>

        <p className="mt-6 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
          {stage.source}
        </p>
      </div>
    </div>
  );
}
