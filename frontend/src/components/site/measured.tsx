"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";

import {
  CELLS,
  CHECKS_CALLING_MODEL,
  CHECKS_TODAY,
  NOT_CHECKED_ENTRIES,
  PAPERS,
  TABLES,
} from "@/components/site/corpus";
import { Scrub, useReducedMotionGate, useSectionProgress } from "@/components/site/motion/scrub";
import { WIDE, useOwnTrack, useWideLayout } from "@/components/site/motion/mobile";
import { Card, Container, Mono } from "@/components/site/ui";

/**
 * The measured band: five rows, each a figure and the file it came from.
 *
 * Four of them count work done and one counts work refused, and the refused one
 * is there on purpose. A band that reports only volume argues that the tool got
 * through a lot of tables; this product's claim is that it knows when to stop,
 * so the 32 things the corpus declined to check belong beside the 7,014 cells it
 * read. Every one of the 32 carries a reason code.
 *
 * Every number is bound from `corpus.ts` rather than typed here, which is the
 * whole point of that file existing — if the checker changes and the corpus
 * figures move, the CI corpus gate catches it and this page moves with them. A
 * `7,014` written into JSX would not.
 *
 * The reference gives this band no heading at all, and that is kept: rows of
 * figure and provenance say what they are. It does get a heading for anything
 * that cannot see the layout, since the section is a nav target and a run of
 * unlabelled rows is not one to arrive at.
 *
 * Motion: the rows arrive in sequence, and each figure's digits roll into place
 * rather than the figure counting up to itself. The distinction is the one this
 * product is built on. A counter tweening 0 → 7,014 displays 3,182 on the way,
 * and 3,182 is a number this corpus never produced; a reader who stops scrolling
 * mid-tween is looking at a figure we invented. A digit roll shows no total at
 * all until it settles — each slot starts blank and travels to the digit it
 * actually holds, and the slot is a fixed `1ch` in a monospaced tabular face, so
 * nothing reflows while it moves.
 *
 * The rows are on a surface now, and it is the quietest one on the page. They sat
 * directly on the field, which made this the one section with no plane of its own
 * at all — five hairlines on grey, between two sections that each carry a card.
 * It rests rather than standing off, deliberately: `decides` and `report` either
 * side of it are arguments and they lift, and this is the provenance underneath
 * them. Something has to be the floor or nothing above it is raised.
 *
 * The hairline moved from the foot of each row to the head of every row after the
 * first, which is the same rule the row before it draws and one rule fewer at the
 * bottom. On the field a trailing rule under the last row closed the band; inside
 * a card it would be a rule with nothing under it but padding.
 *
 * Not pinned. Pinning needs the section's height to change on mount, once
 * `matchMedia` says the viewport is large enough to hold the contents — and this
 * band sits in the middle of the page, so a section that grows from 350px to
 * three screens after hydration drags everything under it out from beneath the
 * reader. The rows scrub against the section's own travel instead, which costs
 * nothing and cannot jump.
 */

const ROWS: { label: string; source: string; value: string }[] = [
  { label: "Validation corpus", source: "fixtures/papers", value: `${PAPERS} papers` },
  { label: "Tables parsed", source: "fixtures/papers", value: `${TABLES} tables` },
  { label: "Cells read", source: "fixtures/papers", value: `${CELLS.toLocaleString("en-GB")} cells` },
  {
    label: "Declined, with a reason attached",
    source: "fixtures/papers",
    value: `${NOT_CHECKED_ENTRIES} entries`,
  },
  {
    label: "Checks that call a model",
    source: "backend/pv/checks",
    value: `${CHECKS_CALLING_MODEL} of ${CHECKS_TODAY}`,
  },
];

/**
 * Where each row starts, and the gap between them.
 *
 * The section is 550px tall, so travel at a 720px viewport is 1270px and the
 * five rows are 52px apart, which is the 0.041 step. 0.315 is 400px of
 * scrolling per row, against 279px before.
 *
 * This band was already the best-placed motion on the page — driving a browser
 * through it put every row between 51% and 63% of the screen on the frame it
 * resolved, which is where an animation can actually be seen. It is the reason
 * the rest of this directory is now derived the same way rather than tuned by
 * eye: the numbers that happened to be right and the numbers that were pointing
 * below the fold looked identical in the source.
 */
const ROW_START = 0.129;
const ROW_SPAN = 0.315;
const ROW_STEP = 0.041;

/**
 * The digits start rolling once the row carrying them is most of the way in.
 *
 * 0.24 is 305px of scrolling for a wheel to travel its ten slots, against 229px,
 * and the offset is bigger so the roll starts against a row that has already
 * established itself rather than against one still arriving. The roll is the one
 * mechanic on this page that is genuinely ours rather than the reference's, and
 * it was resolving fast enough to read as the number simply being there.
 */
const ROLL_OFFSET = 0.1;
const ROLL_SPAN = 0.24;
const ROLL_STEP = 0.022;

/**
 * The slots a digit wheel passes through: one blank, then the ten digits.
 *
 * Blank is first so the resting state before a figure arrives is an empty slot
 * of the right width rather than a zero. A column of zeroes would be a claim.
 */
const SLOTS = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The height of one slot, and so of the window onto the wheel. */
const SLOT_HEIGHT = "1.5em";

/** One digit of a figure, on a wheel that stops on the digit the corpus produced. */
function Digit({
  char,
  progress,
  from,
  to,
}: {
  char: string;
  progress: MotionValue<number>;
  from: number;
  to: number;
}) {
  // The wheel is `SLOTS.length` slots tall, so lifting it by one slot is
  // 100 / SLOTS.length percent of its own height.
  const stop = -((Number(char) + 1) * 100) / SLOTS.length;
  const y = useTransform(progress, [from, to], ["0%", `${stop}%`], { clamp: true });

  return (
    <span
      aria-hidden="true"
      className="inline-block overflow-hidden align-bottom"
      style={{ width: "1ch", height: SLOT_HEIGHT }}
    >
      <motion.span className="flex flex-col" style={{ y }}>
        {SLOTS.map((slot, i) => (
          <span
            key={i}
            className="shrink-0 text-center"
            style={{ height: SLOT_HEIGHT, lineHeight: SLOT_HEIGHT }}
          >
            {slot}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A figure whose digits roll in and whose words do not.
 *
 * The literal text is kept in the accessibility tree as one string — a screen
 * reader should hear "7,014 cells", not eleven separate wheels — and the wheels
 * themselves are `aria-hidden`.
 */
function Rolling({
  value,
  progress,
  start,
  span = ROLL_SPAN,
}: {
  value: string;
  progress: MotionValue<number>;
  start: number;
  /** How much travel one wheel gets. The narrow branch measures its own. */
  span?: number;
}) {
  // `useReducedMotionGate`, not `useReducedMotion`. This branch returns two
  // structurally different trees — a bare text node against an `sr-only` span
  // plus a wheel per digit — and `motion`'s own hook reads `false` on the server
  // and the real value on the client's first render, so the two disagree and
  // React throws the server's markup away. The gate agrees with the server on
  // the first render and swaps in a layout effect before paint.
  const reduced = useReducedMotionGate();
  if (reduced) return <>{value}</>;

  let digit = 0;
  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {[...value].map((char, i) => {
          // A figure and its unit are one thing, so the space between them is
          // non-breaking: "7,014 cells" must not wrap while half of it is
          // still moving.
          if (char < "0" || char > "9") {
            return <span key={i}>{char === " " ? "\u00a0" : char}</span>;
          }
          const from = start + digit++ * ROLL_STEP;
          return <Digit key={i} char={char} progress={progress} from={from} to={from + span} />;
        })}
      </span>
    </>
  );
}

/**
 * One row's contents, in whichever of the two arrangements the width calls for.
 *
 * Three equal columns above `two:`, which is what a band of provenance wants
 * when there is room for it. Below, the figure moves up beside the label and the
 * path goes underneath: three stacked lines per row was 15 lines of left-aligned
 * text down a phone, with the figure — the only thing in the row a reader is
 * looking for — third in every one of them. Two lines, and the figure sits on the
 * right where the eye already goes for a number.
 *
 * A grid rather than nested flex boxes because `dl` is strict about what may sit
 * between it and its `dt`: `dl > div > (dt, dd)` is the grouping HTML allows, and
 * another wrapper inside that div to make a row of two of them is not.
 */
function RowBody({
  row,
  first,
  figure,
}: {
  row: (typeof ROWS)[number];
  first: boolean;
  figure: ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 two:flex two:items-start two:gap-12 ${
        first ? "" : "border-t"
      }`}
      style={{ borderColor: "var(--site-line)" }}
    >
      <dt
        className="col-start-1 row-start-1 two:flex-1"
        style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--site-ink)" }}
      >
        {row.label}
      </dt>
      <dd
        className="col-span-2 col-start-1 row-start-2 two:order-1 two:row-start-1 two:flex-1"
        style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-muted)" }}
      >
        <Mono>{row.source}</Mono>
      </dd>
      <dd
        className="col-start-2 row-start-1 justify-self-end text-right two:order-2 two:flex-1 two:text-left"
        style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--site-ink)" }}
      >
        <Mono>{figure}</Mono>
      </dd>
    </div>
  );
}

/** Above the breakpoint: the section's travel, and the constants measured against it. */
function SectionRows({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      {ROWS.map((row, i) => {
        const from = ROW_START + i * ROW_STEP;
        return (
          <Scrub key={row.label} progress={progress} from={from} to={from + ROW_SPAN} y={14}>
            <RowBody
              row={row}
              first={i === 0}
              figure={
                <Rolling value={row.value} progress={progress} start={from + ROLL_OFFSET} />
              }
            />
          </Scrub>
        );
      })}
    </>
  );
}

/**
 * Below it: each row against its own travel, and the roll placed inside that.
 *
 * This is the section that made the case for the whole of `motion/mobile.tsx`,
 * because here the failure was not a fade landing in the wrong place — it was a
 * **wrong number on screen at rest**. Screenshotted at 390 x 844 the band read
 * `7,0₁3 cells`, `⁵₃₀ entries` and `₀ of ²`: wheels stopped between two digits,
 * holding still, because their windows were a fraction of a section three times
 * taller than the one the fraction was measured against, so the roll had used a
 * third of its travel by the time the row was on screen and never finished.
 *
 * A figure this page never produced, sitting legibly in a band whose whole
 * argument is provenance, is a worse outcome than any amount of missing
 * animation. The doc comment above already states the principle — a counter
 * tweening to 7,014 displays 3,182 on the way and 3,182 is a number this corpus
 * never produced — and the digit roll was built to avoid exactly that. It then
 * did it anyway, on the viewport nobody measured.
 *
 * Measured against the row itself it cannot: progress 0 is the row's own top
 * edge at the fold at every viewport, so the wheels start when the row arrives
 * and finish, by the numbers below, with the row about two thirds of the way up
 * the screen.
 */
function SelfRow({ row, first }: { row: (typeof ROWS)[number]; first: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const { progress, from, to } = useOwnTrack(box, "row");
  const span = to - from;

  return (
    <div ref={box}>
      <Scrub progress={progress} from={from} to={to} y={14}>
        <RowBody
          row={row}
          first={first}
          figure={
            // The wheels start a third of the way into the row's own arrival and
            // run for a fifth longer than it, so the figure settles against a row
            // that is already established rather than against one still coming in.
            <Rolling
              value={row.value}
              progress={progress}
              start={from + span * 0.35}
              span={span * 0.85}
            />
          }
        />
      </Scrub>
    </div>
  );
}

export function Measured() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);
  const wide = useWideLayout(WIDE);

  return (
    <section ref={section} id="measured" className="site-section scroll-mt-20">
      <Container>
        <h2 className="sr-only">Measured</h2>
        <Card
          elevation="resting"
          className="mx-auto w-full max-w-[1200px] px-5 py-2 two:px-6 two:py-4 three:px-12 three:py-6"
        >
          <dl className="flex w-full flex-col">
            {wide ? (
              <SectionRows progress={progress} />
            ) : (
              ROWS.map((row, i) => <SelfRow key={row.label} row={row} first={i === 0} />)
            )}
          </dl>
        </Card>
      </Container>
    </section>
  );
}
