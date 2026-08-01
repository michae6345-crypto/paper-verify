"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useMotionTemplate, type MotionValue } from "motion/react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";

import { Label, TwoTone } from "./section";
import { useScrubbing, useStage, useTrackProgress, usePassed } from "./scrub";
import styles from "./scene.module.css";

/**
 * The hero: the pipeline running once, left to right, with the visitor turning
 * the crank.
 *
 * The section is tall, a viewport-height panel pins inside it, and scroll
 * progress scrubs the sequence — the spine draws, each stage lights as the draw
 * reaches it, its artifact lines follow, and the run's verdict resolves out of
 * blur at the end. Copy arrives last, after the demonstration has already made
 * the argument.
 *
 * The stages are `resolving → extracting → mining → checking → adjudicating`
 * from `backend/pv/orchestrator.py`, not five words invented for a diagram. The
 * lines under them are what those stages actually produce, and the card is the
 * one real finding in the corpus: BERT's GLUE table states an average of 71.0
 * where the mean of its own printed row is 70.944. Everything on this screen
 * traces to `fixtures/reports/1810.04805.json` or to a committed file named in
 * the line beneath it.
 *
 * Below 1100px, below 640px tall, or under `prefers-reduced-motion`, none of
 * this pins or scrubs: the same markup lays out as a plain stacked hero with
 * every element in its final state. `scene.module.css` has the reasoning.
 */

export type HeroStage = { name: string; artifact: string[] };

export type HeroCard = {
  locator: string;
  claimed: string;
  computed: string;
  delta: string;
  verdict: Verdict;
  source: string;
};

/**
 * Where each stage sits in the sequence. The stagger is measured in scroll
 * distance, so a fast scroll compresses the whole run rather than dropping it.
 */
const SPINE_FROM = 0.05;
const SPINE_TO = 0.46;
const STAGE_STEP = 0.075;

/** The slice of progress at which stage `i` is reached by the drawing spine. */
function stageAt(index: number): number {
  return SPINE_FROM + 0.03 + index * STAGE_STEP;
}

/** One tick hanging off the spine, above the stage it names. Wide screens only. */
function Dropline({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const at = stageAt(index);
  const on = useStage(progress, at, at + 0.05, [0, 1]);
  return (
    <motion.span
      className={`${styles.scrub} block h-full w-px`}
      style={{ background: "var(--ink)", opacity: on }}
    />
  );
}

function Stage({
  index,
  stage,
  progress,
}: {
  index: number;
  stage: HeroStage;
  progress: MotionValue<number>;
}) {
  // A stage lights when the spine arrives at it, so the stagger is a consequence
  // of the line's travel rather than a delay bolted onto it.
  const at = stageAt(index);
  const on = useStage(progress, at, at + 0.05, [0, 1]);
  const lines = useStage(progress, at + 0.05, at + 0.12, [0, 1]);
  const linesY = useStage(progress, at + 0.05, at + 0.12, [6, 0]);

  return (
    <li className="flex min-w-0 items-baseline gap-3 three:block">
      {/* On a narrow screen the spine runs down the left and this tick crosses
          it. On a wide one the spine runs along the top and the tick above the
          label does the same job, so it is dropped here. */}
      <motion.span
        aria-hidden="true"
        className={`${styles.scrub} inline-block h-px w-2.5 shrink-0 translate-y-[-4px] three:hidden`}
        style={{ background: "var(--ink)", opacity: on }}
      />
      <div className="min-w-0 flex-1">
        <motion.p
          className={`${styles.scrub} t-num`}
          style={{ color: "var(--ink)", fontSize: "13px", opacity: on }}
        >
          {stage.name}
        </motion.p>
        <motion.div
          className={`${styles.scrub} mt-3 hidden three:block`}
          style={{ opacity: lines, y: linesY }}
        >
          {stage.artifact.map((line) => (
            <p
              key={line}
              className="t-num overflow-hidden text-ellipsis"
              style={{
                color: "var(--mark)",
                fontSize: "11px",
                lineHeight: 1.9,
                whiteSpace: "pre",
              }}
            >
              {line}
            </p>
          ))}
        </motion.div>
      </div>
    </li>
  );
}

export function HeroScene({
  reduced,
  stages,
  card,
  papers,
  tables,
}: {
  reduced: boolean;
  stages: HeroStage[];
  card: HeroCard;
  papers: number;
  tables: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const p = useTrackProgress(track, reduced);
  const scrubbing = useScrubbing(reduced);

  const spine = useStage(p, SPINE_FROM, SPINE_TO, [0, 1]);

  const cardIn = useStage(p, 0.5, 0.62, [0, 1]);
  const cardScale = useStage(p, 0.5, 0.62, [0.96, 1]);
  const cardBlur = useStage(p, 0.52, 0.7, [8, 0]);
  const cardFilter = useMotionTemplate`blur(${cardBlur}px)`;

  // The assembly rises as the pin releases, by exactly the distance the copy
  // beside it needs. Nothing slides in from off-screen.
  const lift = useStage(p, 0.72, 0.88, [0, -16]);

  const copyIn = useStage(p, 0.74, 0.88, [0, 1]);
  const copyY = useStage(p, 0.74, 0.88, [10, 0]);
  // The links are invisible for most of the sequence, so they leave the tab
  // order until they are on screen: nobody is ever focused on something nobody
  // can see, and `Check a paper` is in the header throughout. On a screen that
  // never scrubs they were visible from the first frame, so they stay reachable.
  const copyLive = usePassed(p, 0.78);

  return (
    <div ref={track} className={`${styles.track} ${styles.heroTrack}`}>
      <div className={`${styles.pin} ${styles.paperField} px-4 two:px-10`}>
        <div className="mx-auto w-full max-w-[1120px] py-16 three:py-10">
          <Label>Verification</Label>

          <h1
            className="mt-6 max-w-[18ch]"
            style={{
              fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(27px, 4.6vw, 52px)",
              lineHeight: 1.05,
              letterSpacing: "-0.018em",
            }}
          >
            <TwoTone
              setup={["A paper states the same", "number in several places."]}
              punch="They should agree."
            />
          </h1>

          {/* The run. Left to right on a wide screen, top to bottom on a narrow
              one; one progress value drives both, so it is the same sequence at
              390px as at 1440px. */}
          <motion.div className={`${styles.scrub} relative mt-12 three:mt-14`} style={{ y: lift }}>
            {/* Wide: the spine along the top, with a tick hanging over each
                stage. It stalls when the reader stalls, which is the whole point
                of scrubbing it rather than playing it. */}
            <div className="mb-3 hidden h-5 three:block">
              <div className="relative h-full">
                <motion.div
                  aria-hidden="true"
                  className={`${styles.scrub} absolute top-0 left-0 h-px w-full origin-left`}
                  style={{ background: "var(--grid)", scaleX: spine }}
                />
                <ol aria-hidden="true" className="grid h-full grid-cols-5 gap-x-8">
                  {stages.map((stage, i) => (
                    <li key={stage.name}>
                      <Dropline index={i} progress={p} />
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Narrow: the same spine, turned ninety degrees. */}
            <motion.div
              aria-hidden="true"
              className={`${styles.scrub} absolute top-1 bottom-1 left-[5px] w-px origin-top three:hidden`}
              style={{ background: "var(--grid)", scaleY: spine }}
            />

            <ol className="flex flex-col gap-4 three:grid three:grid-cols-5 three:gap-x-8">
              {stages.map((stage, i) => (
                <Stage key={stage.name} index={i} stage={stage} progress={p} />
              ))}
            </ol>
          </motion.div>

          <div className="mt-12 grid gap-10 three:mt-14 three:grid-cols-[minmax(0,1fr)_400px] three:items-start three:gap-16">
            {/* What the run produced. One card, arriving out of focus and
                sharpening. The only blur on the page, spent once. */}
            <motion.div
              className={`${styles.scrub} w-full border p-5 three:col-start-2 three:row-start-1`}
              style={{
                borderColor: "var(--grid)",
                borderRadius: "var(--radius-site-card)",
                background: "var(--paper)",
                opacity: cardIn,
                scale: cardScale,
                filter: cardFilter,
              }}
            >
              <p className="t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                {card.locator}
              </p>
              <dl className="mt-4 flex flex-col gap-1.5">
                {[
                  ["claimed", card.claimed],
                  ["computed", card.computed],
                  ["delta", card.delta],
                ].map(([term, value]) => (
                  <div key={term} className="flex items-baseline gap-5">
                    <dt
                      className="t-num w-[70px] shrink-0"
                      style={{ color: "var(--mark)", fontSize: "12px" }}
                    >
                      {term}
                    </dt>
                    <dd className="t-num" style={{ color: "var(--ink)", fontSize: "15px" }}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p
                className="mt-4 flex items-center gap-2.5 border-t pt-4"
                style={{ borderColor: "var(--grid)" }}
              >
                <VerdictGlyph verdict={card.verdict} size={12} />
                <span className="t-num" style={{ color: "var(--ink)", fontSize: "13px" }}>
                  {VERDICT_LABEL[card.verdict]}
                </span>
              </p>
              <p className="mt-3 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                {card.source}
              </p>
            </motion.div>

            {/* The argument, after the demonstration. */}
            <motion.div
              className={`${styles.scrub} three:col-start-1 three:row-start-1`}
              style={{ opacity: copyIn, y: copyY }}
              inert={scrubbing && !copyLive}
            >
              <p
                className="max-w-[48ch]"
                style={{ color: "var(--ink-dim)", fontSize: "16px", lineHeight: 1.7 }}
              >
                residual reads a paper&rsquo;s LaTeX source, recomputes the numbers it states, and
                shows you both readings. Every verdict is computed by deterministic Python; a
                language model never produces one.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
                <Link
                  href="/check"
                  className="inline-flex items-center px-6 py-3 transition-colors"
                  style={{
                    border: "1px solid var(--ink)",
                    borderRadius: "var(--radius-site-control)",
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

              <p className="mt-7 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                Validated by hand against <span className="t-num">{papers}</span> papers and{" "}
                <span className="t-num">{tables}</span> tables.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
