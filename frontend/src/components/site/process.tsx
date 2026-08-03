"use client";

import { useEffect, useRef, useState } from "react";
import { MotionValue, useReducedMotion } from "motion/react";

import { Card, Container } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SectionTag } from "@/components/site/section-tag";
import { DrawLine, Scrub, useSectionProgress } from "@/components/site/motion/scrub";
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
 * Below `three:` the cards are already stacked, so the page's own scroll delivers
 * them one at a time and `Reveal` is the whole of it. That branch is a different
 * component rather than a `hidden` class, so nothing subscribes to scroll on a
 * phone — and it is also the `prefers-reduced-motion` branch, where `Reveal`
 * paints resolved and attaches no observer. The `ol` and its classes are the same
 * in both, so reduced motion changes what moves and never where anything sits.
 */

/**
 * `stagger` is how far down the frame the scatter puts a card, and `elevation` is
 * the shadow that agrees with it. The two are written next to each other so they
 * cannot drift: change one offset to zero and its elevation should go back to
 * resting in the same edit.
 */
const STAGES: { name: string; description: string; stagger: string; elevation: string }[] = [
  {
    name: "resolving",
    description: "Find the paper and fetch its source.",
    stagger: "three:mt-[62px]",
    elevation: "three:site-elevated",
  },
  {
    name: "extracting",
    description: "Resolve the multi-file LaTeX and build the macro table.",
    stagger: "three:mt-0",
    elevation: "",
  },
  {
    name: "mining",
    description: "Turn every table cell, link and citation into a checkable claim.",
    stagger: "three:mt-[64px]",
    elevation: "three:site-elevated",
  },
  {
    name: "checking",
    description: "Recompute each claim without deciding anything.",
    stagger: "three:mt-[12px]",
    elevation: "",
  },
  {
    name: "adjudicating",
    description: "Apply the tolerance policy and assign a verdict.",
    stagger: "three:mt-[48px]",
    elevation: "three:site-elevated",
  },
];

/** The rule draws across this slice of the row's travel; the cards follow it. */
const DRAW_FROM = 0.18;
const DRAW_TO = 0.42;

/** The window card `i` holds. Consecutive windows overlap by more than half. */
function stageWindow(i: number): [number, number] {
  const start = 0.2 + i * 0.05;
  return [start, start + 0.18];
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

function StageCard({ stage, index }: { stage: (typeof STAGES)[number]; index: number }) {
  return (
    <Card
      elevation="none"
      className={cn(
        "site-resting flex h-full flex-col justify-between gap-10 p-8 three:min-h-[454px]",
        stage.elevation,
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
        const [from, to] = stageWindow(i);
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
    <div ref={row} className="relative mt-10 three:mt-[60px]">
      <Connector progress={progress} />
      <ol className={OL_CLASS}>
        {STAGES.map((stage, i) => {
          const [from, to] = stageWindow(i);
          return (
            <li key={stage.name} className={`${stage.stagger} ${LI_CLASS}`}>
              <Scrub progress={progress} from={from} to={to} scale={[0.97, 1]}>
                <StageCard stage={stage} index={i} />
              </Scrub>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Stacked, where the page's own scroll already delivers them one at a time. */
function StackedList() {
  return (
    <div className="relative mt-10 three:mt-[60px]">
      <ol className={OL_CLASS}>
        {STAGES.map((stage, i) => (
          <li key={stage.name} className={`${stage.stagger} ${LI_CLASS}`}>
            <Reveal delay={i * 0.05}>
              <StageCard stage={stage} index={i} />
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Process() {
  const reduced = useReducedMotion();
  const row = useRowLayout(!reduced);

  return (
    <section id="process" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="How a run proceeds" heading="The stages a run moves through" />
        {reduced || !row ? <StackedList /> : <ScrubbedRow />}
      </Container>
    </section>
  );
}
