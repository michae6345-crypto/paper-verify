"use client";

import type { ReactNode } from "react";

import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { Reveal } from "@/components/site/reveal";
import { Card, Tag } from "@/components/site/ui";

/**
 * The column the form is answered against.
 *
 * It holds what a demo actually is, which is the thing a request form usually
 * leaves the reader to guess. Three lines, and the last of them is the sentence
 * this whole product is built to be able to say.
 *
 * **Why it is sticky, and why only sometimes.** Above 1100px the form is the
 * taller column by a good margin, and a reader half way down it should still be
 * able to see what they are asking for. Below that the two columns are stacked
 * and there is nothing to stick to.
 *
 * Sticky is scroll-coupled position, so it is gated: a reader who has asked for
 * less motion gets the rail where the document puts it and it stays there.
 * `scripts/check-reduced-motion.mjs` treats a sticky box under
 * `prefers-reduced-motion: reduce` as a failure, which is this repository
 * committing to that reading. The gate is `useReducedMotionGate` rather than
 * `useReducedMotion` for the reason its module comment gives at length: it reads
 * `false` on the server and on the first client render, so the two agree and
 * there is no hydration mismatch to leave a stale attribute behind.
 */

const COVERED = [
  "One run on a paper you choose, from the LaTeX source through to the report.",
  "Where its numbers match, where they diverge, and where residual declines to say either.",
  "Why a check comes back unverifiable, which is a normal outcome and not a failure.",
];

export function DemoRail() {
  const reduced = useReducedMotionGate();

  return (
    <div className={reduced ? undefined : "three:sticky three:top-12"}>
      <Reveal y={24}>
        <Tag>Book a demo</Tag>

        <h1
          className="mt-6"
          style={{
            fontSize: "clamp(36px, 5.4vw, 60px)",
            fontWeight: 400,
            letterSpacing: "-0.045em",
            lineHeight: 1.06,
            color: "var(--site-ink)",
          }}
        >
          See it run on a paper you know
        </h1>

        <p className="site-lede mt-5 max-w-[46ch]">
          residual reads a paper&rsquo;s LaTeX source and checks whether its own numbers agree with
          each other. A demo is one run, end to end, with the evidence behind every verdict on
          screen.
        </p>
      </Reveal>

      <Reveal y={16} scale={0.96} delay={0.08} className="mt-8 two:mt-10">
        <Card elevation="resting" radius="inner" className="px-6 py-2">
          <ul>
            {COVERED.map((line, index) => (
              <Line key={line} first={index === 0}>
                {line}
              </Line>
            ))}
          </ul>
        </Card>
      </Reveal>

      <Reveal y={16} delay={0.14} className="mt-6">
        <p className="max-w-[46ch]" style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-muted)" }}>
          residual does not judge whether a paper is good, novel or true. It checks whether the
          paper agrees with itself, and shows its working either way.
        </p>
      </Reveal>
    </div>
  );
}

/** A row of the list. The rule is between the items, so the first has none. */
function Line({ children, first }: { children: ReactNode; first: boolean }) {
  return (
    <li
      className="py-4"
      style={{
        borderTop: first ? undefined : "1px solid var(--site-line)",
        fontSize: "15px",
        lineHeight: 1.6,
        color: "var(--site-ink)",
      }}
    >
      {children}
    </li>
  );
}
