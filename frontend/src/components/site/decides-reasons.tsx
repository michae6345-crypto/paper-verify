"use client";

import { useRef } from "react";

import { Rise, useOwnTrack } from "@/components/site/motion/mobile";
import { Scrub } from "@/components/site/motion/scrub";
import { Card, Mono } from "@/components/site/ui";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

/**
 * Why a check declines.
 *
 * The four codes are `ReasonCode` in `backend/pv/models.py`, spelled exactly as
 * the enum spells them, because they are what a report prints and a reader who
 * meets one in a report should recognise it here. They are four of about
 * sixteen, and the lead line says so.
 *
 * Each description names the thing that makes the situation undecidable, in one
 * clause. They ran to two and three clauses each and said the same thing twice:
 * "two or more values are bold inside the same rule-delimited block" and "so
 * there is no single best one for the bolding to be claiming" are one fact and
 * its restatement. The foot line keeps the half of the rule that is easy to
 * lose, which is that declining still publishes the comparison.
 *
 * **Layout.** A single full-width band, four columns at `three:`, a 2x2 at
 * `two:`, stacked below. It is the first object under the section heading now
 * and the change of plane the section makes, so it carries the argument on its
 * own.
 *
 * **Motion.** The panel arrives as a surface, then the four codes in reading
 * order, then each code's mark. That last one is the detail worth having: the
 * glyph is a proofreader's query and it lands *after* the line it belongs to,
 * the way a mark is made on a page that has already been read.
 *
 * Every window is measured from the element that carries it. The codes used to
 * open at 0.18 of the panel's travel, a figure derived from a panel measured at
 * 380px tall; shortening the four descriptions took about 45px out of that
 * panel, and a constant in that form goes wrong without ever looking broken. The
 * two numbers left in this file are fractions of an element's own window, so
 * they hold at whatever height the copy turns out to have.
 */

const REASONS: { code: string; description: string }[] = [
  {
    code: "multiple_bold_in_column",
    description: "Two values are bold in the same block, so there is no single best one to claim.",
  },
  {
    code: "metric_direction_unknown",
    description:
      "No arrow in the header and no entry in the direction table, so higher or lower would be a guess.",
  },
  {
    code: "cell_spans_columns",
    description: "The value spans several columns, so it belongs to no one of them.",
  },
  {
    code: "average_denominator_ambiguous",
    description: "More than one reading of the row reproduces the printed average.",
  },
];

/**
 * Reading order between four columns of equal height, which geometry cannot
 * supply, and how far into its own arrival a code's mark is made. Both are
 * fractions of the element's own window, so they mean the same thing at 390 and
 * at 1920.
 */
const CODE_LEAD = 0.03;
const MARK_LAG = 0.4;

/**
 * One code, on its own measured track.
 *
 * `useOwnTrack` rather than two nested `Rise`s: the line and the mark are two
 * windows on one element, and measuring the mark separately would measure a
 * 14px box that is itself being translated by the arrival it sits inside. The
 * four columns are the same height as each other, so geometry has nothing to say
 * about which is read first and `lead` supplies it.
 */
function Reason({ reason, index }: { reason: (typeof REASONS)[number]; index: number }) {
  const box = useRef<HTMLLIElement>(null);
  const { progress, from, to } = useOwnTrack(box, "row", index * CODE_LEAD);

  return (
    <li ref={box}>
      <Scrub progress={progress} from={from} to={to} y={14} className="flex flex-col gap-2">
        {/* No blur. Text resolving out of a blur reads as a font failing to
            load, and §4 of the teardown spends that effect once, on the one
            element that matters, which on this page is the hero's verdict. */}
        <Scrub
          progress={progress}
          from={from + (to - from) * MARK_LAG}
          to={to}
          y={0}
          className="flex"
        >
          <VerdictGlyph verdict="unverifiable" size={14} />
        </Scrub>
        <p className="site-mono" style={{ fontSize: "14px", lineHeight: 1.5, color: "#ffffff" }}>
          {reason.code}
        </p>
        <p style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}>
          {reason.description}
        </p>
      </Scrub>
    </li>
  );
}

export function DecidesReasons() {
  return (
    <Rise
      kind="surface"
      y={12}
      scale={[0.96, 1]}
      lift="card"
      boxClassName="site-stack"
    >
      {/* `elevation="none"`, because the shadow is on the scrubbed layer above
          and arrives with the panel instead of being there from the first
          frame. The prop writes an inline `box-shadow`, so leaving it set
          would put two of them on one surface. */}
      <Card tone="dark" elevation="none" className="flex flex-col gap-8 p-6 two:gap-10 two:p-8 three:p-12">
        <div className="flex flex-col gap-3 three:flex-row three:items-baseline three:gap-12">
          <h3
            className="shrink-0"
            style={{
              fontSize: "clamp(20px, 1.8vw, 26px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.4,
              color: "#ffffff",
            }}
          >
            Why a check declines
          </h3>
          <p style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}>
            Four of the reason codes in <Mono>backend/pv/models.py</Mono>.
          </p>
        </div>

        {/* The `Scrub` sits inside the `li` rather than around it: a `div`
            between `ul` and `li` is not a list any more. */}
        <ul className="grid gap-8 two:grid-cols-2 two:gap-10 three:grid-cols-4">
          {REASONS.map((reason, i) => (
            <Reason key={reason.code} reason={reason} index={i} />
          ))}
        </ul>

        <p
          className="max-w-[80ch]"
          style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}
        >
          The comparison stays in the report with both numbers on it, and only the verdict is
          withheld.
        </p>
      </Card>
    </Rise>
  );
}
