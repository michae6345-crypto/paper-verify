import Link from "next/link";

import { realReports } from "./corpus.server";
import { HeroRunLoop } from "./hero-run-loop";
import { PAPERS, TABLES } from "./corpus";

/**
 * §16 §1. No mascot, no illustration. What sits beside the headline is the run
 * view itself, playing real recorded output, so the claim and the thing running
 * next to it are the same thing.
 */
export function Hero() {
  const reports = realReports();

  return (
    <section
      className="border-b px-5 pt-14 pb-16 two:px-8 two:pt-20 two:pb-24"
      style={{ borderColor: "var(--chrome-line)" }}
    >
      <div className="mx-auto grid w-full max-w-[1080px] gap-10 three:grid-cols-[1.05fr_1fr] three:items-center three:gap-14">
        <div className="max-w-[56ch]">
          <p className="t-label">Internal consistency checking for ML papers</p>

          <h1
            className="mt-4 font-medium tracking-[-0.015em]"
            style={{
              color: "var(--chrome-text)",
              fontSize: "clamp(30px, 5.4vw, 46px)",
              lineHeight: 1.1,
            }}
          >
            Check whether a paper&rsquo;s own numbers agree with each other.
          </h1>

          <p
            className="mt-5"
            style={{ color: "var(--chrome-dim)", fontSize: "16px", lineHeight: 1.6 }}
          >
            paper-verify reads an arXiv paper&rsquo;s LaTeX source, recomputes what can be
            recomputed, and reports where the numbers match, where they diverge, and where it
            cannot tell. It does not judge whether a paper is good, novel, or true.
          </p>

          <p
            className="mt-4"
            style={{ color: "var(--chrome-faint)", fontSize: "15px", lineHeight: 1.6 }}
          >
            A language model never produces a verdict. Every verdict is computed by deterministic
            Python from extracted structure, so it can be re-derived and defended a year later.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/check"
              className="inline-flex items-center px-4 py-2.5 font-medium transition-colors"
              style={{
                background: "var(--chrome-raised)",
                color: "var(--chrome-text)",
                border: "1px solid var(--chrome-line)",
                borderRadius: "var(--radius-panel)",
                fontSize: "14px",
                transitionDuration: "var(--dur-fast)",
              }}
            >
              Check a paper
            </Link>
            <Link
              href="/reports/1810.04805"
              className="inline-flex items-center px-4 py-2.5 transition-colors"
              style={{
                color: "var(--focus)",
                borderRadius: "var(--radius-panel)",
                fontSize: "14px",
                transitionDuration: "var(--dur-fast)",
              }}
            >
              Read a finished report
            </Link>
          </div>

          <p className="mt-6 t-num" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
            Validated by hand against <span className="t-num">{PAPERS}</span> papers and{" "}
            <span className="t-num">{TABLES}</span> tables.
          </p>
        </div>

        <HeroRunLoop reports={reports} />
      </div>
    </section>
  );
}
