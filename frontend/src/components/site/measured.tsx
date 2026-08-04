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
import { DrawLine, Scrub } from "@/components/site/motion/scrub";
import { WIDE, useOwnTrack, useWideLayout } from "@/components/site/motion/mobile";
import { Card, Mono } from "@/components/site/ui";

/**
 * The measured ledger: five figures, each with the file it came from.
 *
 * Four of them count work done and one counts work refused, and the refused one
 * is there on purpose. A band that reports only volume argues that the tool got
 * through a lot of tables; this product's claim is that it knows when to stop,
 * so the 32 things the corpus declined to check belong beside the 7,014 cells it
 * read. Every one of the 32 carries a reason code.
 *
 * Every number is bound from `corpus.ts` rather than typed here, which is the
 * whole point of that file existing. If the checker changes and the corpus
 * figures move, the CI corpus gate catches it and this page moves with them. A
 * `7,014` written into JSX would not.
 *
 * **This is no longer a section.** It was one, between `apparatus` and `report`,
 * with a screen-reader-only heading standing in for the one the layout does not
 * want. It renders inside `decides` now, under the four reason codes, because
 * two of these five figures are that section's evidence: `0 of 4` checks call a
 * model, and 32 things were declined with a reason. The heading it needed as a
 * nav target went with the move, and the page lost a section break.
 *
 * The rows sit on the quietest surface on the page. The dark panel above states
 * the claim and this rests under it, which is the same relationship it had to
 * `apparatus` and `report` when it stood between them: something has to be the
 * floor or nothing above it is raised.
 *
 * ---
 *
 * **Why the wide layout turns ninety degrees.** Five stacked rows of label,
 * path and figure is a ledger, and a ledger is the same object as the four-row
 * card in `report` and the reason-code list in `decides`. Above `three:` there
 * is room to set the five side by side instead: the figure leads, the label sits
 * under it, the path under that, and a drawn hairline separates each column from
 * the one before. The band then reads across rather than down, which is a
 * different room from anything either side of it, and the figures stop being the
 * third thing in every line.
 *
 * Below `three:` it stays a ledger, because five columns on a phone is five
 * columns of two characters each.
 *
 * ---
 *
 * **Motion: the figures' digits roll into place rather than the figure counting
 * up to itself.** The distinction is the one this product is built on. A counter
 * tweening 0 → 7,014 displays 3,182 on the way, and 3,182 is a number this
 * corpus never produced; a reader who stops scrolling mid-tween is looking at a
 * figure we invented. A digit roll shows no total at all until it settles: each
 * slot starts blank and travels to the digit it actually holds, and the slot is a
 * fixed `1ch` in a monospaced tabular face, so nothing reflows while it moves.
 *
 * **Every window here is measured against the element that carries it**, at both
 * layouts and at every viewport. That is not a preference. Screenshotted at
 * 390 x 844 this band once read `7,0₁3 cells`, `⁵₃₀ entries` and `₀ of ²`:
 * wheels stopped between two digits, holding still, because their windows were a
 * fraction of a section three times taller than the one the fraction was
 * measured against, so the roll had used a third of its travel by the time the
 * row was on screen and never finished. A figure this page never produced,
 * sitting legibly in a band whose whole argument is provenance, is a worse
 * outcome than any amount of missing animation.
 *
 * Measured against the element itself it cannot happen: progress 0 is that
 * element's own top edge at the fold at every viewport, so the wheels start when
 * it arrives and finish, by the fractions below, with it about two thirds of the
 * way up the screen. The section's own travel is not read at all any more, and
 * there is no constant left in this file that a change of layout could make
 * stale.
 *
 * Not pinned. Pinning needs the section's height to change on mount, once
 * `matchMedia` says the viewport is large enough to hold the contents, and this
 * band sits in the middle of the page, so a section that grows from 350px to
 * three screens after hydration drags everything under it out from beneath the
 * reader.
 */

const ROWS: { label: string; source: string; value: string }[] = [
  { label: "Validation corpus", source: "fixtures/papers", value: `${PAPERS} papers` },
  { label: "Tables parsed", source: "fixtures/papers", value: `${TABLES} tables` },
  { label: "Cells read", source: "fixtures/papers", value: `${CELLS.toLocaleString("en-GB")} cells` },
  {
    label: "Declined, with a reason",
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
 * Where a wheel starts inside its own element's window, and how long it runs.
 *
 * Both are fractions of that window rather than of a section, so they mean the
 * same thing at 390 and at 1920.
 *
 * **They are set by one requirement: the last digit has to stop before the
 * figure is read.** `useSectionProgress` fixes progress 0.5 as the frame an
 * element's centre reaches the centre of the screen, at every viewport and
 * every height, and that is the frame a reader is looking at the number. A wheel
 * still turning then is showing a figure this corpus never produced, which is
 * the failure this whole file is built around and which it shipped once.
 *
 * The arithmetic, at the worst case in the band, which is the last column whose lead is
 * `4 × COLUMN_LEAD`, and the widest figure, whose fourth digit starts three
 * `ROLL_STEP`s behind the first:
 *
 *     0.08 lead + 0.455 span × 0.18 + 3 × 0.022 + 0.455 span × 0.48 = 0.446
 *
 * against the 0.5 it has to beat. The arrival it sits inside closes at 0.535, so
 * the figure now settles a little before the block carrying it finishes fading,
 * rather than a little after. That is the right way round: a number has to be
 * true before it is legible, and it was the other way round when this was
 * measured: the last three columns were still turning with the band sitting
 * two hundred pixels from the top of the screen.
 *
 * A wheel still gets 0.48 of its element's window, which is about 180px of
 * scrolling. Short enough to be a stop and long enough to be a roll.
 */
const ROLL_START = 0.18;
const ROLL_LENGTH = 0.48;

/**
 * How far along its own travel each column is held back from the one before it.
 *
 * The five sit at the same height in the wide band, so geometry alone would
 * deliver them on the same frame. Stacked, they are already at five different
 * heights and the lead is not used at all.
 *
 * 0.02 rather than 0.03, and the reason is the wheels rather than the fade. A
 * lead is spent twice: once by the column arriving and again by the last digit
 * of its figure, which starts behind everything ahead of it. At 0.03 the fifth
 * column's last digit landed at 0.48, close enough to the reading position that
 * a slow reader met it still turning. At 0.02 it lands at 0.446, and the four
 * columns still arrive in order across about 65px of scrolling.
 */
const COLUMN_LEAD = 0.02;

/**
 * The slots a digit wheel passes through: one blank, then the ten digits.
 *
 * Blank is first so the resting state before a figure arrives is an empty slot
 * of the right width rather than a zero. A column of zeroes would be a claim.
 */
const SLOTS = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The height of one slot, and so of the window onto the wheel. */
const SLOT_HEIGHT = "1.5em";

/** The gap between one digit's window and the next, inside a figure. */
const ROLL_STEP = 0.022;

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
 * The literal text is kept in the accessibility tree as one string (a screen
 * reader should hear "7,014 cells", not eleven separate wheels) and the wheels
 * themselves are `aria-hidden`.
 *
 * There is no reduced-motion branch here and there does not need to be: every
 * caller takes its window from `useOwnTrack`, which returns a progress fixed at
 * 1 for a reader who asked for less motion, so each wheel renders already
 * stopped on its own digit.
 */
function Rolling({
  value,
  progress,
  start,
  span,
}: {
  value: string;
  progress: MotionValue<number>;
  start: number;
  /** How much travel one wheel gets. Measured by the caller. */
  span: number;
}) {
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

/** Where a figure's wheels run, given the window its element arrives on. */
function rollWindow(from: number, to: number): { start: number; span: number } {
  const span = to - from;
  return { start: from + span * ROLL_START, span: span * ROLL_LENGTH };
}

/**
 * One row's contents, stacked. What every viewport under `three:` gets.
 *
 * Three equal columns above `two:`, which is what a band of provenance wants
 * when there is room for it. Below, the figure moves up beside the label and the
 * path goes underneath: three stacked lines per row was 15 lines of left-aligned
 * text down a phone, with the figure, the only thing in the row a reader is
 * looking for, third in every one of them. Two lines, and the figure sits on the
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

/** One row of the ledger, on its own track. */
function SelfRow({ row, first }: { row: (typeof ROWS)[number]; first: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const { progress, from, to } = useOwnTrack(box, "row");
  const roll = rollWindow(from, to);

  return (
    <div ref={box}>
      <Scrub progress={progress} from={from} to={to} y={14}>
        <RowBody
          row={row}
          first={first}
          figure={<Rolling value={row.value} progress={progress} start={roll.start} span={roll.span} />}
        />
      </Scrub>
    </div>
  );
}

/**
 * The hairline between two columns, drawn downward as the column arrives.
 *
 * The same two-unit viewBox the phone's spine uses, for the same reason: with
 * `preserveAspectRatio="none"` the segment stretches to whatever height the band
 * turns out to be, and the stroke does not stretch with it.
 */
function ColumnRule({
  progress,
  from,
  to,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
}) {
  return (
    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5">
      <svg className="h-full w-0.5" viewBox="0 0 2 100" preserveAspectRatio="none">
        <g stroke="var(--site-line-strong)">
          <DrawLine progress={progress} from={from} to={to} d="M1 0 V100" strokeWidth={1} />
        </g>
      </svg>
    </span>
  );
}

/**
 * One column of the wide band: the figure, then what it counts, then the path.
 *
 * The figure is larger here than in the ledger and that is the only type size in
 * this file that changes with the layout. Five figures across a 1,100px card are
 * the thing the band is for; five figures at 14px in the same arrangement would
 * be a row of captions. It is capped at 24px because the widest of them,
 * `7,014 cells`, sets at 0.6em per character in Fragment Mono and has to clear
 * the narrowest column the band ever has, 160px at the 1100 breakpoint, against
 * 119px of glyphs. The space inside a figure is non-breaking, so a figure that
 * did not fit would overflow rather than wrap.
 */
function SelfColumn({ row, index }: { row: (typeof ROWS)[number]; index: number }) {
  const box = useRef<HTMLDivElement>(null);
  const { progress, from, to } = useOwnTrack(box, "row", index * COLUMN_LEAD);
  const roll = rollWindow(from, to);

  return (
    <div
      ref={box}
      className={`relative min-w-0 flex-1 ${index === 0 ? "" : "pl-6 three:pl-8"}`}
    >
      {index > 0 && <ColumnRule progress={progress} from={from} to={to} />}
      <Scrub progress={progress} from={from} to={to} y={14} className="grid gap-1.5">
        <dt
          className="row-start-2"
          style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--site-ink)" }}
        >
          {row.label}
        </dt>
        <dd
          className="row-start-3"
          style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-muted)" }}
        >
          <Mono>{row.source}</Mono>
        </dd>
        <dd
          className="row-start-1"
          style={{
            fontSize: "clamp(18px, 1.6vw, 24px)",
            lineHeight: 1.5,
            letterSpacing: "-0.02em",
            color: "var(--site-ink)",
          }}
        >
          <Mono>
            <Rolling value={row.value} progress={progress} start={roll.start} span={roll.span} />
          </Mono>
        </dd>
      </Scrub>
    </div>
  );
}

export function MeasuredLedger() {
  const wide = useWideLayout(WIDE);

  return (
    // The id outlives the section it used to name, so any link anyone still
    // holds lands on the figures rather than at the top of the page.
    <div id="measured" className="site-stack scroll-mt-20">
      <Card
        elevation="resting"
        className="mx-auto w-full max-w-[1200px] px-5 py-2 two:px-6 two:py-4 three:px-10 three:py-10"
      >
        {wide ? (
          <dl className="flex w-full items-stretch">
            {ROWS.map((row, i) => (
              <SelfColumn key={row.label} row={row} index={i} />
            ))}
          </dl>
        ) : (
          <dl className="flex w-full flex-col">
            {ROWS.map((row, i) => (
              <SelfRow key={row.label} row={row} first={i === 0} />
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}
