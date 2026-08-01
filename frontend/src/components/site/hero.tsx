import Link from "next/link";

import { heroReports } from "./corpus.server";
import { HeroRunLoop } from "./hero-run-loop";
import { Field, Opener, Wash } from "./section";
import { PAPERS, TABLES } from "./corpus";

/**
 * The hero is a light field with the instrument sitting on it.
 *
 * BRIEF §2's idea, made the page's opening image: the document is warm and
 * light, the verification chrome is cool and dark, and the interface is the seam
 * between them. So the field is `--field-paper` and the ledger beside the
 * headline keeps its own dark chrome rather than being lightened to match.
 *
 * No mascot and no illustration. What sits next to the claim is the thing that
 * makes it.
 */
export function Hero() {
  const reports = heroReports();

  return (
    <Field tone="paper">
      <div className="grid gap-12 three:grid-cols-[1.02fr_1fr] three:items-center three:gap-14">
        <div>
          <Opener
            level={1}
            label="Verification"
            heading={
              <>
                Papers should agree with <Wash>themselves</Wash>.
              </>
            }
            lede={
              <>
                residual reads a paper&rsquo;s LaTeX source and recomputes the numbers it
                states. It reports where they match, where they diverge, and where it cannot
                tell. It does not judge whether a paper is good, novel, or true.
              </>
            }
          />

          <p
            className="mt-5 max-w-[58ch]"
            style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: 1.65 }}
          >
            A language model never produces a verdict here. Every verdict is computed by
            deterministic Python from extracted structure, so it can be re-derived and defended a
            year later.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/check"
              className="inline-flex items-center px-5 py-2.5 transition-colors"
              style={{
                border: "1px solid var(--ink)",
                borderRadius: "var(--radius-panel)",
                color: "var(--ink)",
                fontSize: "15px",
                transitionDuration: "var(--dur-fast)",
              }}
            >
              Check a paper
            </Link>
            <Link
              href="/reports/1810.04805"
              className="inline-flex items-center underline underline-offset-4"
              style={{
                color: "var(--ink)",
                textDecorationColor: "var(--mark)",
                fontSize: "15px",
              }}
            >
              Read a finished report
            </Link>
          </div>

          <p className="mt-8 t-num" style={{ color: "var(--mark)", fontSize: "12px" }}>
            Validated by hand against <span className="t-num">{PAPERS}</span> papers and{" "}
            <span className="t-num">{TABLES}</span> tables.
          </p>
        </div>

        <HeroRunLoop reports={reports} />
      </div>
    </Field>
  );
}
