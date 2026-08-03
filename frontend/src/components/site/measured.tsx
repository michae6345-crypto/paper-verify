"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

import {
  CELLS,
  CHECKS_CALLING_MODEL,
  CHECKS_TODAY,
  NOT_CHECKED_ENTRIES,
  PAPERS,
  TABLES,
} from "@/components/site/corpus";
import { Scrub, useReducedMotionGate, useSectionProgress } from "@/components/site/motion/scrub";
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

/** Where each row starts, and the gap between them. */
const ROW_START = 0.12;
const ROW_SPAN = 0.22;
const ROW_STEP = 0.055;

/** The digits start rolling once the row carrying them is most of the way in. */
const ROLL_OFFSET = 0.06;
const ROLL_SPAN = 0.18;
const ROLL_STEP = 0.02;

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
}: {
  value: string;
  progress: MotionValue<number>;
  start: number;
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
          return (
            <Digit key={i} char={char} progress={progress} from={from} to={from + ROLL_SPAN} />
          );
        })}
      </span>
    </>
  );
}

export function Measured() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <section ref={section} id="measured" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <h2 className="sr-only">Measured</h2>
        <Card
          elevation="resting"
          className="mx-auto w-full max-w-[1200px] px-6 py-4 three:px-12 three:py-6"
        >
          <dl className="flex w-full flex-col">
            {ROWS.map((row, i) => {
              const from = ROW_START + i * ROW_STEP;
              return (
                <Scrub key={row.label} progress={progress} from={from} to={from + ROW_SPAN} y={20}>
                  <div
                    className={`flex flex-col gap-2 py-4 two:flex-row two:items-start two:gap-12 ${
                      i === 0 ? "" : "border-t"
                    }`}
                    style={{ borderColor: "var(--site-line)" }}
                  >
                    <dt
                      className="two:flex-1"
                      style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-ink)" }}
                    >
                      {row.label}
                    </dt>
                    <dd
                      className="two:flex-1"
                      style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-muted)" }}
                    >
                      <Mono>{row.source}</Mono>
                    </dd>
                    <dd
                      className="two:flex-1"
                      style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-ink)" }}
                    >
                      <Mono>
                        <Rolling value={row.value} progress={progress} start={from + ROLL_OFFSET} />
                      </Mono>
                    </dd>
                  </div>
                </Scrub>
              );
            })}
          </dl>
        </Card>
      </Container>
    </section>
  );
}
