"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * §16 §4. The §14.2 run state machine, with the artifact each stage produces.
 *
 * §16 asks for this animated. §6 forbids animating on scroll, and §16 permits
 * only three motion additions on the site, none of them this one. So the
 * timeline advances when the visitor moves through it, not when the page does.
 * Selection is a 120ms colour and border change and nothing else.
 *
 * Five of the nine stages run today. The other four are specified in
 * `docs/ARCHITECTURE.md` §14 and not written, and the timeline says which is
 * which. A visitor deciding whether to trust us is exactly the person who should
 * not have to find that out later.
 */

type Stage = {
  id: string;
  name: string;
  built: boolean;
  summary: string;
  artifact: string[];
  source: string;
};

const STAGES: Stage[] = [
  {
    id: "resolving",
    name: "resolving",
    built: true,
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
    built: true,
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
    built: false,
    summary:
      "Turns the parsed document into claims: one per table cell holding a value, one per URL, one per bibliography entry. Each carries a content hash, so a verdict can be replayed against exactly the claim that produced it.",
    artifact: [
      "content_hash = sha256(kind, anchor.dom_id, verbatim, value)",
      "",
      "Claim is declared in models.py and has no call sites yet.",
      "Until it does, every run discards its structured",
      "intermediate: ten papers processed leaves as much",
      "accumulated knowledge as zero.",
    ],
    source: "docs/ARCHITECTURE.md §14.3",
  },
  {
    id: "awaiting_artifact",
    name: "awaiting artifact",
    built: false,
    summary:
      "Waits for you to confirm which repository belongs to the paper, for at most ten minutes. On expiry the run continues without one and the code-dependent checks resolve unverifiable.",
    artifact: [
      "timeout    10 minutes, then artifact = None",
      "result     unverifiable / no_code_repository",
      "",
      "A run must never block indefinitely on a human.",
    ],
    source: "docs/ARCHITECTURE.md §14.2 · docs/BRIEF.md §5.2",
  },
  {
    id: "planning",
    name: "planning",
    built: false,
    summary:
      "Asks each checker which claims it applies to, so a check that runs on nothing is recorded as such instead of silently disappearing.",
    artifact: [
      "def applies(claim: Claim, ctx: CheckContext) -> bool",
      "",
      "A missing checker module must produce",
      "not_attempted / checker_error — never nothing.",
    ],
    source: "docs/ARCHITECTURE.md §14.3, §14.7",
  },
  {
    id: "checking",
    name: "checking",
    built: true,
    summary:
      "Runs every check. A check that raises is recorded as unverifiable with the reason, and the run carries on. One failing check never takes the report down.",
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
    built: false,
    summary:
      "Separates what a checker measured from what the system concludes. The tolerance band moves out of the checker and into a versioned policy file, so revising it publicly means replaying stored observations rather than re-accusing everyone.",
    artifact: [
      "# policies/tolerance.yaml",
      "default:",
      "  rule: reported_precision   # 87.4 carries an implicit ±0.05",
      "",
      "The ±0.05 band lives inside row_arithmetic.py today.",
    ],
    source: "docs/ARCHITECTURE.md §14.4",
  },
  {
    id: "complete",
    name: "complete or partial",
    built: true,
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

export function Mechanism() {
  const [selected, setSelected] = useState("extracting");
  const stage = STAGES.find((s) => s.id === selected) ?? STAGES[0];

  return (
    <div className="mt-10 grid gap-4 three:grid-cols-[260px_1fr] three:gap-8">
      <ol
        className="flex flex-col"
        aria-label="Run stages"
        style={{ borderLeft: "1px solid var(--chrome-line)" }}
      >
        {STAGES.map((s) => {
          const active = s.id === stage.id;
          return (
            <li key={s.id} className="relative">
              {/* The stage marker sits on the rail, not beside it. */}
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 transition-colors"
                style={{
                  background: active ? "var(--focus)" : "var(--chrome-line)",
                  borderRadius: "1px",
                  transitionDuration: "var(--dur-fast)",
                }}
              />
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                aria-current={active ? "step" : undefined}
                className="flex w-full items-baseline justify-between gap-3 py-2 pr-3 pl-4 text-left transition-colors"
                style={{
                  color: active ? "var(--chrome-text)" : "var(--chrome-dim)",
                  background: active ? "var(--chrome-raised)" : "transparent",
                  transitionDuration: "var(--dur-fast)",
                  borderRadius: "0 var(--radius-chip) var(--radius-chip) 0",
                }}
              >
                <span className="t-num" style={{ fontSize: "13px" }}>
                  {s.name}
                </span>
                {!s.built && (
                  <span
                    className="shrink-0 whitespace-nowrap"
                    style={{ color: "var(--chrome-faint)", fontSize: "11px" }}
                  >
                    not built
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div
        className={cn("flex flex-col border p-5 two:p-6")}
        style={{
          borderColor: "var(--chrome-line)",
          background: "var(--chrome-panel)",
          borderRadius: "var(--radius-panel)",
        }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="t-num" style={{ color: "var(--chrome-text)", fontSize: "15px" }}>
            {stage.name}
          </h3>
          <span style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
            {stage.built ? "runs today" : "specified, not written"}
          </span>
        </div>

        <p
          className="mt-3 max-w-[68ch]"
          style={{ color: "var(--chrome-dim)", fontSize: "15px", lineHeight: 1.6 }}
        >
          {stage.summary}
        </p>

        <pre
          className="mt-5 flex-1 overflow-x-auto border-t pt-5 whitespace-pre t-num"
          style={{
            borderColor: "var(--chrome-line)",
            color: stage.built ? "var(--chrome-dim)" : "var(--chrome-faint)",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          {stage.artifact.join("\n")}
        </pre>

        <p className="mt-5 t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
          {stage.source}
        </p>
      </div>
    </div>
  );
}
