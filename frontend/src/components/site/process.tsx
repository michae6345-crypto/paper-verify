"use client";

import { useEffect, useRef, useState } from "react";
import { MotionValue } from "motion/react";

import { Card, Container } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SectionTag } from "@/components/site/section-tag";
import {
  DrawLine,
  Scrub,
  useReducedMotionGate,
  useSectionProgress,
} from "@/components/site/motion/scrub";
import { SpineList } from "@/components/site/motion/mobile";
import { cn } from "@/lib/utils";

/**
 * How a run proceeds.
 *
 * The five names are `RunStage` in `backend/pv/orchestrator.py`, and they are
 * the five a run passes through. The enum holds five more, which are either a
 * state a run waits in or the state it ends in.
 *
 * The reference scatters the cards vertically by 62 / 0 / 64 / 12 / 48px, and
 * that is kept: a straight row of five equal cards reads as a table of contents,
 * and this is meant to read as a sequence. The scatter is on the `three:`
 * breakpoint only, because below it the cards stack.
 *
 * Elevation agrees with the scatter. A card the scatter pushes down the frame
 * sits nearer the reader by the ground-plane convention every flat layout
 * borrows from, and takes `--site-shadow-card`, while the two the scatter holds
 * up take the lighter `--site-shadow-raised`. Both come off at the same
 * breakpoint, which is why the shadow is a class here and not the `elevation`
 * prop: a prop cannot hold a breakpoint. `elevation="none"` on the `Card` keeps
 * this to one shadow, since the prop writes an inline `box-shadow` that no class
 * can override.
 *
 * ---
 *
 * A sequence should arrive in sequence. Above `three:` the five sit side by side
 * with nothing to say in what order they are read, so a rule draws left to right
 * above them and each card comes up as the rule reaches its node. The stagger is
 * a consequence of the draw, expressed as overlapping windows in the row's own
 * scroll progress. Below `three:` the same rule runs downward past a node on
 * each card, which is the direction a phone is already moving in.
 *
 * Three branches, and the two questions are asked separately: width picks the
 * layout, and the motion preference picks whether it arrives. A wide viewport
 * with `prefers-reduced-motion` gets `StackedList`, which is the row resolved.
 */

/**
 * `stagger` is how far down the frame the scatter puts a card, and `elevation`
 * is the shadow that agrees with it. The two are written next to each other so
 * they cannot drift.
 *
 * `lift` is the same shadow again, as a scrubbed layer rather than a class,
 * because the two are needed in different branches. `ScrubbedRow` only renders
 * above `three:`, so the shadow can arrive with the card. `StackedList` needs
 * the class, because it is also what a wide viewport with reduced motion gets,
 * and there nothing animates.
 */
const STAGES: {
  name: string;
  description: string;
  stagger: string;
  elevation: string;
  lift: "raised" | "card";
}[] = [
  {
    name: "resolving",
    description: "Fetch the source from arXiv.",
    stagger: "three:mt-[62px]",
    elevation: "three:site-elevated",
    lift: "card",
  },
  {
    name: "extracting",
    description: "Build the macro table across every file.",
    stagger: "three:mt-0",
    elevation: "",
    lift: "raised",
  },
  {
    name: "mining",
    description: "Turn cells, links and citations into claims.",
    stagger: "three:mt-[64px]",
    elevation: "three:site-elevated",
    lift: "card",
  },
  {
    name: "checking",
    description: "Recompute each claim without deciding anything.",
    stagger: "three:mt-[12px]",
    elevation: "",
    lift: "raised",
  },
  {
    name: "adjudicating",
    description: "Apply the tolerance policy and assign a verdict.",
    stagger: "three:mt-[48px]",
    elevation: "three:site-elevated",
    lift: "card",
  },
];

/**
 * The rule draws across this slice of the row's travel; the cards follow it.
 *
 * The draw starts late because of the scatter. Stage 1 carries the largest
 * offset, `mt-[62px]`, so it is the lowest card on the screen and it also has to
 * be the first to arrive. No choice of numbers satisfies both: a window that
 * closes early enough to lead the other four necessarily closes while its own
 * card is still low. 0.08 is where that trade was measured out. At 0, stage 1
 * was 68% resolved before its centre had cleared the fold; here it is 41%, and
 * the four behind it are all under 10%.
 */
const DRAW_FROM = 0.08;
const DRAW_TO = 0.36;

/**
 * How long a card takes once the rule has reached it, and how long a node takes.
 *
 * The node is short on purpose: a 6px dot fading over 400px is not a dot lighting
 * up, it is a dot that was always there. It should read as the line arriving at
 * something.
 */
const CARD_SPAN = 0.32;
const NODE_SPAN = 0.05;

/**
 * How far behind its own card the stage's name and description arrive.
 *
 * The card is a surface and the words on it are content. Splitting them by 0.03
 * of the row's travel, about 37px of scrolling, is the difference between a
 * picture of a card that has writing on it and a card that arrives and is then
 * written on. Small on purpose: §4 of the teardown puts items within a group
 * close enough to read as one gesture, and this is a group of two.
 */
const TEXT_LEAD = 0.03;

/**
 * Where the rule reaches stage `i`. Every other window here is derived from it.
 *
 * This is the one section whose stagger is not geometric. Everywhere else on
 * this page an element's window comes from where it sits, and the reading order
 * falls out of the layout for free. Here the scatter deliberately puts stage 1
 * lower on the screen than stage 2, so geometry would deliver the five cards in
 * the order 2, 4, 5, 1, 3. The sequence is the entire content of this section,
 * so the draw orders them and the scatter is left to do its other job.
 */
function stageArrival(i: number): number {
  return DRAW_FROM + (DRAW_TO - DRAW_FROM) * ((i + 0.5) / STAGES.length);
}

/** The window card `i` holds. Consecutive windows overlap by more than four fifths. */
function stageWindow(i: number): [number, number] {
  const arrival = stageArrival(i);
  return [Math.max(0, arrival - 0.01), arrival + CARD_SPAN];
}

/** The node on the rule above card `i`, lighting as the line touches it. */
function nodeWindow(i: number): [number, number] {
  const arrival = stageArrival(i);
  return [Math.max(0, arrival - 0.005), arrival + NODE_SPAN];
}

/** Is the row laid out as a row? The `three:` breakpoint, as a decision rather than a class. */
function useRowLayout(enabled: boolean) {
  const [row, setRow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia("(min-width: 1100px)");
    const update = () => setRow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [enabled]);

  return row;
}

/**
 * One stage of the row.
 *
 * `three:min-h-[320px]` is what holds the five to a common height. Measured
 * content at 1440 is about 313px: 64 of padding, a 90px numeral, the 40px gap,
 * and three lines of description under a name. The floor was 454, which put 134
 * pixels of empty card under every stage and a screen of nothing into the page.
 */
function StageCard({
  stage,
  index,
  lifted,
  text,
}: {
  stage: (typeof STAGES)[number];
  index: number;
  /** The scrubbed branch carries the shadow on a layer outside this card. */
  lifted?: boolean;
  /** Where in the row's travel the writing on the card follows the card. */
  text?: { progress: MotionValue<number>; from: number; to: number };
}) {
  const label = (
    <div className="flex flex-col items-center gap-1 text-center">
      <h3
        className="site-mono"
        style={{
          fontSize: "clamp(18px, 1.6vw, 24px)",
          lineHeight: 1.6,
          color: "var(--site-ink)",
        }}
      >
        {stage.name}
      </h3>
      <p className="site-body">{stage.description}</p>
    </div>
  );

  return (
    <Card
      elevation="none"
      className={cn(
        "flex h-full flex-col justify-between gap-8 p-8 three:min-h-[320px]",
        !lifted && "site-resting",
        !lifted && stage.elevation,
      )}
    >
      <p
        style={{
          fontSize: "clamp(44px, 5vw, 72px)",
          fontWeight: 300,
          letterSpacing: "-0.06em",
          lineHeight: 1.25,
          color: "var(--site-ink)",
        }}
      >
        {index + 1}
      </p>
      {text ? (
        // 10px against the card's 12, so the two travel together and the words
        // settle last. A second, longer slide here would read as the label
        // catching up rather than as one object arriving.
        <Scrub progress={text.progress} from={text.from} to={text.to} y={10}>
          {label}
        </Scrub>
      ) : (
        label
      )}
    </Card>
  );
}

/** The rule above the row, with a node over each card. Drawn, not placed. */
function Connector({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-8 h-8" aria-hidden="true">
      <div className="absolute inset-x-0 top-4 h-px" style={{ background: "var(--site-line)" }} />

      <svg
        className="absolute inset-x-0 top-4 h-px w-full"
        viewBox="0 0 1000 1"
        preserveAspectRatio="none"
      >
        <g stroke="var(--site-ink)">
          <DrawLine
            progress={progress}
            from={DRAW_FROM}
            to={DRAW_TO}
            d="M0 0.5 H1000"
            strokeWidth={1}
          />
        </g>
      </svg>

      {STAGES.map((stage, i) => {
        const [from, to] = nodeWindow(i);
        return (
          <div
            key={stage.name}
            className="absolute top-[13px] -translate-x-1/2"
            style={{ left: `${((i + 0.5) / STAGES.length) * 100}%` }}
          >
            <div className="relative h-1.5 w-1.5">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--site-line-strong)" }}
              />
              <Scrub progress={progress} from={from} to={to} y={0} className="absolute inset-0">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--site-ink)" }}
                />
              </Scrub>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const OL_CLASS = "flex flex-col gap-14 three:flex-row three:items-start three:gap-4";
const LI_CLASS = "three:min-w-0 three:flex-1";

/** Side by side, so the order has to be drawn. */
function ScrubbedRow() {
  const row = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(row);

  return (
    <div ref={row} className="site-stack relative">
      <Connector progress={progress} />
      <ol className={OL_CLASS}>
        {STAGES.map((stage, i) => {
          const [from, to] = stageWindow(i);
          return (
            <li key={stage.name} className={`${stage.stagger} ${LI_CLASS}`}>
              {/* 12px of travel, not 24. §4 of the teardown is explicit that a
                  card enters on opacity plus a small scale and never slides from
                  far off screen, and 24px alongside a scale reads as a card being
                  thrown at its slot rather than settling into it. */}
              <Scrub
                progress={progress}
                from={from}
                to={to}
                y={12}
                scale={[0.96, 1]}
                lift={stage.lift}
              >
                <StageCard
                  stage={stage}
                  index={i}
                  lifted
                  text={{ progress, from: from + TEXT_LEAD, to }}
                />
              </Scrub>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The row layout with nothing moving. What a wide viewport gets under reduced motion. */
function StackedList() {
  return (
    <div className="site-stack relative">
      <ol className={OL_CLASS}>
        {STAGES.map((stage, i) => (
          <li key={stage.name} className={`${stage.stagger} ${LI_CLASS}`}>
            <Reveal delay={i * 0.05} y={16} scale={0.96}>
              <StageCard stage={stage} index={i} />
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The narrow branch: the same five stages on a spine that draws downward.
 *
 * `ScrubbedRow` draws a rule left to right and lights a node over each card as
 * it reaches it. This is that, rotated, which is the arrangement that fits the
 * direction a phone scrolls. `SpineList` in `motion/mobile.tsx` owns the
 * mechanic; what is here is the card.
 *
 * The card is much shorter than the row's. `three:min-h-[320px]` and
 * `justify-between` exist to make five cards of unequal copy agree on a height
 * in a row; stacked, that produces a floating numeral, a field of nothing, and a
 * centred caption at the bottom. Here the number, the stage and the description
 * are one block, read top to bottom.
 */
function SpineStages() {
  return (
    <div className="site-stack">
      <SpineList
        count={STAGES.length}
        rowClassName="pb-4"
        renderRow={(i, window) => (
          <Scrub
            progress={window.progress}
            from={window.from}
            to={window.to}
            y={12}
            scale={[0.96, 1]}
            lift="raised"
            liftRadius="card"
          >
            <Card elevation="none" className="flex flex-col gap-1.5 p-5">
              <div className="flex items-baseline gap-3">
                <span
                  className="site-mono"
                  style={{ fontSize: "13px", color: "var(--site-muted)" }}
                >
                  {i + 1}
                </span>
                <h3
                  className="site-mono"
                  style={{ fontSize: "16px", lineHeight: 1.4, color: "var(--site-ink)" }}
                >
                  {STAGES[i].name}
                </h3>
              </div>
              <p className="site-body" style={{ fontSize: "15px", lineHeight: 1.6 }}>
                {STAGES[i].description}
              </p>
            </Card>
          </Scrub>
        )}
      />
    </div>
  );
}

export function Process() {
  // The gate, not `motion`'s `useReducedMotion`. This picks between structurally
  // different trees, which is the case the module comment in `motion/scrub.tsx`
  // describes at length.
  //
  // The two questions are asked separately, because they are separate. Width
  // decides the layout, a row of five or a spine, and it is asked whatever the
  // motion preference is, so a reduced-motion reader on a wide screen still gets
  // the row. The preference then decides only whether that row arrives.
  const reduced = useReducedMotionGate();
  const row = useRowLayout(true);

  return (
    <section id="process" className="site-section scroll-mt-20">
      <Container>
        <SectionTag tag="How a run proceeds" heading="Five stages" />
        {row ? reduced ? <StackedList /> : <ScrubbedRow /> : <SpineStages />}
      </Container>
    </section>
  );
}
