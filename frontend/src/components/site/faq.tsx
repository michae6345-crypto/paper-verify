import type { ReactNode } from "react";

/**
 * §16 §8. Lead with the hard ones. A FAQ that opens on pricing is a FAQ that is
 * avoiding something.
 *
 * Native `<details>`, so the accordion works with JavaScript off and keeps the
 * platform's keyboard and screen-reader behaviour. The only transition is a
 * 120ms colour change on the summary.
 */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "What if you're wrong?",
    a: (
      <>
        <p>
          Then we want to hear it immediately, and the report is built so you can say so:{" "}
          <span style={{ color: "var(--chrome-text)" }}>Report this as incorrect</span> sits beside
          every finding, one click away.
        </p>
        <p>
          Six false findings have been caught so far, all before shipping, and all written down:
          reading <code className="t-num">86.7/85.9</code> as one number, comparing a bolded value
          against its whole column instead of its block, treating an &ldquo;All layers&rdquo;
          column header as an average. Each one is now a test. They are in{" "}
          <code className="t-num">fixtures/GROUND_TRUTH.md</code> under the heading &ldquo;every
          case below is a false positive we must not produce&rdquo;.
        </p>
        <p>
          And no high-severity divergence reaches a public permalink unreviewed. A person reads it
          first; suppressing it requires a reason code, and the suppression is written back into
          the fixtures as a negative test so the same mistake cannot recur silently.
        </p>
      </>
    ),
  },
  {
    q: "Is this AI detection?",
    a: (
      <>
        <p>
          No. It does not estimate whether a paper was written by a model, and it never will. That
          question has no reliable answer, and accusing someone on the strength of a guess is the
          thing this product exists to avoid.
        </p>
        <p>
          What it does is arithmetic on numbers the authors printed themselves: is the bolded value
          the best one in its block, does the average column equal the mean of its row, do the
          links resolve, do the references exist.
        </p>
      </>
    ),
  },
  {
    q: "Do you contact authors?",
    a: (
      <p>
        No. Nothing is sent to anyone. A run produces a report for whoever asked for it, and
        high-severity divergences are held back from public permalinks until a person has reviewed
        them.
      </p>
    ),
  },
  {
    q: "Does a language model decide any of this?",
    a: (
      <>
        <p>
          Never. A model may extract structure (which cells are in this table, which sentence
          refers to which cell), and a verdict is then computed by deterministic Python from that
          structure. No model-derived structure can produce a divergence on its own; it has to be
          confirmed by recomputation, or the result is unverifiable.
        </p>
        <p>
          All four checks that exist today run without calling a model at all. A probabilistic
          verdict published about a named researcher is not a feature we are missing.
        </p>
      </>
    ),
  },
  {
    q: "Why does so much come back unverifiable?",
    a: (
      <>
        <p>
          Because the alternative is guessing. When a step in the pipeline discards something a
          verdict might rest on, the answer is unverifiable with the reason attached, and the
          comparison is shown anyway. That covers a table whose rows do not match its column spec,
          a column whose metric direction is not stated, and an average whose denominator is not
          written down.
        </p>
        <p>
          A run where half the checks come back unverifiable with clear reasons is working as
          intended. The list of what was not checked is a first-class part of the report, not an
          error state.
        </p>
      </>
    ),
  },
  {
    q: "What does it cost, and what do you keep?",
    a: (
      <p>
        Nothing yet. It is not a paid product. Papers are fetched from arXiv&rsquo;s public
        e-print endpoint at one request every three seconds and cached, so the same paper is never
        pulled twice. Runs are currently held in memory and do not survive a restart, which is
        also why there is no permalink you can rely on yet.
      </p>
    ),
  },
];

export function Faq() {
  return (
    <div className="mt-10 max-w-[76ch]">
      {FAQS.map((item) => (
        <details
          key={item.q}
          className="group border-t py-1 first:border-t-0"
          style={{ borderColor: "var(--chrome-line)" }}
        >
          <summary
            className="cursor-pointer list-none py-4 transition-colors marker:content-none"
            style={{
              color: "var(--chrome-text)",
              fontSize: "16px",
              lineHeight: 1.45,
              transitionDuration: "var(--dur-fast)",
            }}
          >
            <span className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="t-num shrink-0"
                style={{ color: "var(--chrome-faint)", fontSize: "13px" }}
              >
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
              <span>{item.q}</span>
            </span>
          </summary>
          <div
            className="flex flex-col gap-3 pt-1 pb-5 pl-[26px]"
            style={{ color: "var(--chrome-dim)", fontSize: "15px", lineHeight: 1.6 }}
          >
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}
