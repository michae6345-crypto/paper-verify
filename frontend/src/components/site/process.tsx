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
 * the five a run actually passes through. The enum holds five more — `queued`,
 * `awaiting_artifact`, `planning`, and the three terminal states — which are
 * either a state a run waits in or the state it ends in, not a stage it moves
 * through. Listing those here would be padding.
 *
 * The reference scatters the cards vertically by 62 / 0 / 64 / 12 / 48px, and
 * that is kept: a straight row of five equal cards reads as a table of contents,
 * and this is meant to read as a sequence. The scatter is on the `three:`
 * breakpoint only, because below it the cards stack and an offset would just be
 * five cards at five wrong heights.
 *
 * The scatter is also where the depth comes from. Five cards at one elevation are
 * five planes at five heights, which is jitter; the offset has to mean something
 * or it is noise. So elevation agrees with it: a card the scatter pushes down the
 * frame sits nearer the reader by the ground-plane convention every flat layout
 * borrows from, and takes `--site-shadow-card`, while the two the scatter holds
 * up take the lighter `--site-shadow-raised`. Vertical offset and shadow weight
 * then describe the same thing instead of contradicting each other.
 *
 * Both come off at the same breakpoint, and that is why the shadow is a class here
 * rather than the `elevation` prop: a prop cannot hold a breakpoint. Below `three:`
 * every card is at `mt-0` and every card rests, because there is no scatter left
 * for the elevation to agree with. `elevation="none"` on the `Card` is what keeps
 * this to one shadow — the prop writes an inline `box-shadow`, which no class can
 * override, so the two mechanisms cannot both be live at once.
 *
 * ---
 *
 * A sequence should arrive in sequence. Above `three:` the five sit side by side
 * with nothing to say in what order they are read, so a rule draws left to right
 * above them and each card comes up as the rule reaches its node — the stagger is
 * a consequence of the draw, expressed as overlapping windows in the row's own
 * scroll progress rather than as five delays in milliseconds. A reader who flicks
 * past gets the whole row; one who scrolls slowly gets five stages in order.
 *
 * Below `three:` the same rule runs the other way. It used to be five stacked
 * cards fading in on a timeline, which is the arrangement in which the sequence
 * is carried by nothing at all — the scatter and the elevation that make the row
 * read as an order are both off at that width by design, and a fade tells the
 * reader nothing about what follows what. `SpineStages` turns the rule through
 * ninety degrees instead, so it draws downward past a node on each card, which is
 * the direction a phone is already moving in.
 *
 * Three branches, then, and the two questions are asked separately: width picks
 * the layout, and the motion preference picks whether it arrives. A wide viewport
 * with `prefers-reduced-motion` gets `StackedList`, which is the row resolved.
 */

/**
 * `stagger` is how far down the frame the scatter puts a card, and `elevation` is
 * the shadow that agrees with it. The two are written next to each other so they
 * cannot drift: change one offset to zero and its elevation should go back to
 * resting in the same edit.
 *
 * `lift` is the same shadow again, as a scrubbed layer rather than a class, and
 * it exists because the two are needed in different branches. `ScrubbedRow` only
 * ever renders above `three:`, so inside it the breakpoint is already satisfied
 * and the shadow can arrive with the card instead of being painted on from the
 * first frame. `StackedList` is the branch that still needs the class, because
 * it is also what a wide viewport with `prefers-reduced-motion` renders, and
 * there the scatter is present and nothing animates.
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
    description: "Turn each cell, link and citation into a claim.",
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
 * The row's track is 504px tall, so travel at a 720px viewport is 1224px and the
 * old 0.18 → 0.42 draw was 294px of scrolling for the whole spine. It is 343px
 * now, and it starts later rather than earlier, which is the opposite of what
 * the rest of this directory needed.
 *
 * The reason is the scatter. Stage 1 carries the largest offset, `mt-[62px]`, so
 * it is the lowest card on the screen, and it also has to be the first to
 * arrive. Those two pull against each other and no choice of numbers satisfies
 * both: a window that closes early enough to lead the other four necessarily
 * closes while its own card is still low. 0.08 is where that trade was measured
 * out rather than argued — at 0, stage 1 was 68% resolved before its centre had
 * cleared the fold; here it is 41%, and the four behind it are all under 10%.
 * The alternative was to flatten the scatter, and the scatter is the reference's
 * and is doing a different job.
 */
const DRAW_FROM = 0.08;
const DRAW_TO = 0.36;

/**
 * How long a card takes once the rule has reached it, and how long a node takes.
 *
 * 0.32 of 1224px is 392px of scrolling, against 220px before. The node is short
 * on purpose: a 6px dot fading over 400px is not a dot lighting up, it is a dot
 * that was always there. It should read as the line arriving at something.
 */
const CARD_SPAN = 0.32;
const NODE_SPAN = 0.05;

/**
 * Where the rule reaches stage `i`. Every other window here is derived from it.
 *
 * This is the one section whose stagger is *not* geometric. Everywhere else on
 * this page an element's window comes from where it sits, and the reading order
 * falls out of the layout for free. Here the scatter deliberately puts stage 1
 * lower on the screen than stage 2, so geometry would deliver the five cards in
 * the order 2, 4, 5, 1, 3. The sequence is the entire content of this section,
 * so the draw orders them instead and the scatter is left to do its other job.
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

function StageCard({
  stage,
  index,
  lifted,
}: {
  stage: (typeof STAGES)[number];
  index: number;
  /** The scrubbed branch carries the shadow on a layer outside this card. */
  lifted?: boolean;
}) {
  return (
    <Card
      elevation="none"
      className={cn(
        "flex h-full flex-col justify-between gap-10 p-8 three:min-h-[454px]",
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
                <StageCard stage={stage} index={i} lifted />
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
 * What this replaces is five cards the height of the desktop's, stacked, each
 * one fading in on a timeline as it arrived — 2,400px of scrolling through a
 * sequence whose whole content is that it is a sequence, with nothing on screen
 * connecting one card to the next. The scatter and the elevation that make the
 * desktop row read as an order are both off at this width by design, so the
 * order was carried by nothing at all.
 *
 * The spine carries it instead, and it is the section's own idea rather than a
 * mobile pattern borrowed from somewhere: `ScrubbedRow` above already draws a
 * rule left to right and lights a node over each card as it reaches it. This is
 * that, rotated, which is the arrangement that fits the direction a phone
 * scrolls. `SpineList` in `motion/mobile.tsx` owns the mechanic; what is here is
 * the card.
 *
 * The card is also much shorter. `three:min-h-[454px]` and `justify-between`
 * exist to make five cards of unequal copy agree on a height in a row; stacked,
 * they produced a floating numeral, four hundred pixels of nothing, and a
 * centred caption at the bottom — a desktop card's internal layout applied to a
 * shape it was not for. Here the number, the stage and the description are one
 * block, read top to bottom.
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
  // describes at length: `useReducedMotion` reads null on the server and the
  // truth on the client's first render, so the two disagree and React keeps the
  // server's attributes on a node the client thinks it owns.
  //
  // The two questions are now asked separately, because they are separate. Width
  // decides the *layout* — a row of five or a spine — and it is asked whatever
  // the motion preference is, so a reduced-motion reader on a wide screen still
  // gets the row rather than a phone's spine at 1440px. The preference then
  // decides only whether that row arrives or is simply there.
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
