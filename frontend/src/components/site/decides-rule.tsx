"use client";

import { useRef, type ReactNode } from "react";
import type { MotionValue } from "motion/react";

import { DrawLine } from "@/components/site/motion/scrub";
import { Arrive, WIDE, useOwnTrack, useWideLayout } from "@/components/site/motion/mobile";
import { Mono } from "@/components/site/ui";

/**
 * The rule that governs everything, laid out as the three things that happen.
 *
 * This is the product's central claim and it used to be a paragraph in the
 * right-hand column of a two-column band, level with the top of a dark card that
 * was carrying a different argument. Three sentences of the most load-bearing
 * copy on the page, set as an aside to something else, at the size of a caption.
 * The complaint about it was that it was oddly placed and oddly formatted, and
 * both were true: the claim was not in the position of the claim.
 *
 * It is the section heading now, in the two-tone form `MOTION_TEARDOWN.md` §2
 * records, and this band is the three steps it decomposes into. `extract`,
 * `compute`, `decline` are stages of one sentence rather than three features,
 * which is why they sit as three columns of running text on the page field with
 * nothing but a hairline between them. There is no card here on purpose. A card
 * would make this a component of the section, and it is the section.
 *
 * The wording is `CLAUDE.md`'s, kept close on purpose. A model extracts
 * structure, deterministic Python computes every verdict from that structure,
 * and a check that cannot be made deterministic returns `unverifiable` with a
 * `ReasonCode` rather than guessing.
 *
 * Motion: the divider between two columns draws downward, and the column to its
 * right follows it in. Above `three:` those dividers are the only thing on the
 * band that is not text, so drawing them is the whole of the movement here, and
 * it runs in reading order because each column's window opens a little after its
 * neighbour's. Below `three:` the columns stack, the dividers would be three
 * horizontal rules with nothing to separate, and each block arrives on its own
 * travel instead, which the stacking already staggers by geometry.
 */

type Step = {
  verb: string;
  body: ReactNode;
};

const STEPS: Step[] = [
  {
    verb: "extract",
    body: (
      <>
        A model reads the source and hands back structure. Which cells are in this table, which
        claim points at which cell, and nothing else. It is never asked whether a number is right,
        and its answer is an input to the next step rather than a finding.
      </>
    ),
  },
  {
    verb: "compute",
    body: (
      <>
        Deterministic Python recomputes the quantity from that structure and compares it to what the
        paper printed. The same structure gives the same verdict every time, which is what makes a
        finding something a reader can check for themselves instead of something they have to take
        on trust.
      </>
    ),
  },
  {
    verb: "decline",
    body: (
      <>
        A check that cannot be made deterministic returns <Mono>unverifiable</Mono> with a reason
        code and attaches the comparison anyway, so the numbers are still there to read. It does not
        fall back to an opinion, and it does not guess.
      </>
    ),
  },
];

/** How far the text lags the divider that draws beside it, in the column's travel. */
const LAG = 0.05;

/** Reading order between columns of equal height, which geometry cannot supply. */
const LEAD_STEP = 0.04;

/** How much of a column's arrival the divider spends drawing. It gets there first. */
const RULE_SHARE = 0.7;

/**
 * The hairline between two columns, inking in downward.
 *
 * Positioned in the gutter rather than on a column's border, so the two columns
 * either side of it stay the same width and nothing shifts when it appears.
 * `-left-6` is half of the 48px gap. It is `three:` only, because below that
 * breakpoint the columns are stacked and a vertical rule between them would be
 * pointing across the reading direction rather than along it.
 */
function Divider({ progress, from, to }: { progress: MotionValue<number>; from: number; to: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 -left-6 hidden w-px three:block"
    >
      <span className="absolute inset-0" style={{ background: "var(--site-line)" }} />
      <svg className="absolute inset-0 h-full w-px" viewBox="0 0 1 100" preserveAspectRatio="none">
        <g stroke="var(--site-line-strong)">
          <DrawLine progress={progress} from={from} to={to} d="M0.5 0 V100" strokeWidth={1} />
        </g>
      </svg>
    </span>
  );
}

/**
 * One step, on its own measured track.
 *
 * The three columns are the same height as each other, so geometry has nothing
 * to say about which is read first and `lead` supplies it: 0.04 of a column's
 * travel is around 45px of scrolling between one and the next, which leaves the
 * three overlapping by more than nine tenths. They arrive as one object with an
 * internal order rather than as a queue of three.
 */
function StepColumn({ step, index }: { step: Step; index: number }) {
  const column = useRef<HTMLLIElement>(null);
  const lead = index * LEAD_STEP;
  const { progress, from, to } = useOwnTrack(column, "row", lead);
  const wide = useWideLayout(WIDE);

  return (
    <li ref={column} className="relative">
      {index > 0 && wide && (
        <Divider progress={progress} from={from} to={from + (to - from) * RULE_SHARE} />
      )}
      {/* The horizontal rule the stacked layout gets instead. It is static: the
          stroke that would draw it is placed against this column's track, and
          below the breakpoint the text beside it is measured on a track of its
          own, so the two would arrive at nearly but not quite the same moment. */}
      <span
        aria-hidden="true"
        className="mb-5 block h-px w-full three:hidden"
        style={{ background: "var(--site-line)" }}
      />
      <Arrive
        progress={progress}
        from={from + LAG}
        to={to}
        lead={lead + LAG}
        y={14}
        className="flex flex-col gap-3"
      >
        <p className="site-mono" style={{ fontSize: "15px", color: "var(--site-muted)" }}>
          {step.verb}
        </p>
        <p
          style={{
            fontSize: "clamp(16px, 1.15vw, 18px)",
            letterSpacing: "-0.01em",
            lineHeight: 1.6,
            color: "var(--site-ink)",
          }}
        >
          {step.body}
        </p>
      </Arrive>
    </li>
  );
}

export function DecidesRule() {
  return (
    <ol className="site-stack flex flex-col gap-10 three:grid three:grid-cols-3 three:gap-12">
      {STEPS.map((step, i) => (
        <StepColumn key={step.verb} step={step} index={i} />
      ))}
    </ol>
  );
}
