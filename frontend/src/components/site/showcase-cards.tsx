"use client";

import Link from "next/link";
import { useRef } from "react";

import { Scrub, useReducedMotionGate, useSectionProgress } from "@/components/site/motion/scrub";
import { Card } from "@/components/site/ui";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";

/**
 * The card row, and its motion.
 *
 * This exists as a separate file only because `showcase.tsx` reads the committed
 * run reports off disk and so cannot be a client component. Every string and
 * every figure here arrives as a prop; nothing about a paper or a table is
 * decided in this file.
 *
 * ---
 *
 * **The row, and why it is a row on a phone too.**
 *
 * The template's cards were a grid at desktop and the thing worth keeping from
 * them was that they read as a *set* — four objects of one kind, side by side,
 * differing only in content. Stacking them into four full-width cards at 390px
 * keeps the content and loses the argument: a reader scrolling past four tall
 * cards one at a time never sees that the four tables are different shapes,
 * which is the only reason the row is here.
 *
 * So below `two:` it is a horizontally scrolled row with snap points, at 78vw a
 * card, and above it a two-up and then a four-up grid. The row is a real scroll
 * container with `tabIndex` and a label, so it is reachable from the keyboard
 * rather than being a gesture-only region.
 *
 * ---
 *
 * **The motion.** One progress track spans the whole row and each card maps its
 * own window of it, which is the page's vocabulary everywhere: windows rather
 * than delays, so a reader who flicks past gets the sequence compressed instead
 * of four animations queued behind a scroll that has already finished.
 *
 * The windows are derived rather than tuned, by the arithmetic in `scrub.tsx`:
 * a surface arriving as an object gets `W = 0.60 H` of travel, which at the
 * 720px viewport most readers have is about 430px of scrolling. The section is
 * roughly one viewport tall at desktop, so its travel is about `2 H` and 0.60 H
 * is 0.30 of it. The four windows start at 0.12 and step by 0.05, so the last
 * one closes at 0.57 — inside `S/(H+S)`, which `scrub.tsx` warns is where a
 * window has to close if it is not to resolve somewhere the reader cannot see.
 *
 * Each card carries `lift`, so its shadow arrives with it and slightly behind
 * it: the surface reaches full opacity while its elevation is still coming in,
 * which is what makes it read as settling onto the page rather than as a picture
 * that happens to include a shadow. That requires `elevation="none"` on the
 * `Card` inside, because two shadows on one surface reads as fog — `ui.tsx` says
 * so and `scrub.tsx` says so, and this is the one prop pairing that is easy to
 * get wrong.
 *
 * Under `prefers-reduced-motion` every one of these renders resolved on the
 * first paint, including the lift layer, and no scroll subscription is read.
 * That is `Scrub`'s own behaviour and this file does nothing to help or hinder
 * it — which is the point of the primitive.
 */

export type ShowcaseItem = {
  arxivId: string;
  title: string;
  href: string;
  label: string;
  plate: string;
  note: string;
  rows: number;
  columns: number;
  cells: number;
  blocks: number;
  bold: number;
  tablesParsed: number;
  verdicts: Verdict[];
};

/** Where the first card's window opens, how long each lasts, and the stagger. */
const CARD_FROM = 0.12;
const CARD_SPAN = 0.3;
const CARD_STEP = 0.05;

/**
 * The run's verdicts, as marks.
 *
 * Glyphs rather than words, because four cards times two checks is eight labels
 * competing with the plates for a row that is meant to be read as pictures. The
 * words are still there for anything that cannot see the marks: each glyph is
 * `aria-hidden` and the strip carries one visually hidden sentence naming the
 * verdicts in order. `VERDICT_LABEL` is what renders `not_attempted` as **not
 * checked**, which is a normal outcome for a run and must not read as a failure.
 */
function Verdicts({ verdicts }: { verdicts: Verdict[] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {verdicts.map((verdict, i) => (
        <VerdictGlyph key={`${verdict}-${i}`} verdict={verdict} size={12} />
      ))}
      <span className="sr-only">
        {verdicts.map((v) => VERDICT_LABEL[v]).join(", ") || "no checks recorded"}
      </span>
    </span>
  );
}

/**
 * One card: the plate, then what it is, then what the run said about the paper.
 *
 * The whole card is the link. A 4:3 plate plus four lines of text is well past
 * any touch target minimum, and a card with a small "view report" control in the
 * corner would put a 44px target inside a 300px one for no reason.
 *
 * The plate sits at `--site-radius-inner` inside a card at `--site-radius-card`,
 * which is the nesting those two tokens exist for. It carries no shadow of its
 * own: it is inside an elevated surface, and `ui.tsx` is explicit that stacking
 * a second shadow there reads as fog.
 *
 * `alt` describes the plate rather than repeating the caption underneath it,
 * which a screen reader would otherwise read twice.
 */
function ShowcaseCard({ item }: { item: ShowcaseItem }) {
  return (
    <Link
      href={item.href}
      className="group block h-full rounded-[var(--site-radius-card)] focus-visible:outline-2 focus-visible:outline-offset-4"
      style={{ outlineColor: "var(--site-accent)" }}
    >
      <Card elevation="none" radius="card" className="flex h-full flex-col p-3">
        <span
          className="block overflow-clip"
          style={{
            borderRadius: "var(--site-radius-inner)",
            background: "var(--site-card)",
          }}
        >
          {/* Not `next/image`: fixed-aspect SVGs with no variants to generate
              and no layout to reserve, so the loader would add a build step and
              a wrapper element for nothing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.plate}
            alt={`The structure of table ${item.label}: ${item.rows} rows by ${item.columns} columns, ${item.blocks} rule-delimited blocks, and ${item.bold} cells set in bold.`}
            width={320}
            height={240}
            loading="lazy"
            decoding="async"
            className="block aspect-[4/3] w-full object-cover"
            draggable={false}
          />
        </span>

        <span className="mt-4 flex flex-1 flex-col gap-2 px-2 pb-2">
          {/* `site-mono` directly rather than `<Mono>`: that component takes no
              `style`, and `ui.tsx` belongs to another workstream. Same utility,
              same face, same tabular figures — `hero.tsx` sets its own monospace
              the same way. */}
          <span className="site-mono" style={{ fontSize: "12px", color: "var(--site-muted)" }}>
            {item.label}
          </span>

          <span
            className="line-clamp-2 font-medium"
            style={{ fontSize: "15px", lineHeight: 1.35, color: "var(--site-ink)" }}
          >
            {item.title}
          </span>

          <span className="site-body" style={{ fontSize: "13px", lineHeight: 1.5 }}>
            {item.note}
          </span>

          <span className="mt-auto flex items-center justify-between gap-3 pt-3">
            {/* One line, not three. A text chunk spanning lines has each line's
                leading whitespace trimmed, so ` cells` written under the
                expression renders as `104cells`. */}
            <span className="site-mono" style={{ fontSize: "11px", color: "var(--site-muted)" }}>
              {`${item.cells.toLocaleString("en-GB")} cells`}
            </span>
            <Verdicts verdicts={item.verdicts} />
          </span>
        </span>
      </Card>
    </Link>
  );
}

/**
 * The row itself. One class name, both layouts.
 *
 * `overflow-x-auto` makes this a real scroll container below `two:`, which is
 * wanted here and is the reason nothing on this page pins inside it.
 */
const ROW =
  "mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 " +
  "two:mt-12 two:grid two:grid-cols-2 two:gap-6 two:overflow-visible two:pb-0 three:grid-cols-4";

/** One card's slot in the row, at both layouts. */
const SLOT = "w-[78vw] shrink-0 snap-start two:w-auto two:shrink";

/**
 * The row for a reader who asked for less motion.
 *
 * A separate component rather than an early return, and for the reason `Pin`
 * gives: `useSectionProgress` calls `useScroll` unconditionally, so an early
 * return inside one component would still have constructed the subscription. A
 * hook cannot be conditional, so the only way to genuinely not open one is for
 * the branch that does not want it to be a component that never calls it.
 *
 * The lift layer is still drawn, at rest and at full strength. The resolved
 * state of a card is a card with a shadow, and dropping the elevation along with
 * the animation would quietly flatten this row for exactly the readers who asked
 * for less movement, not less depth.
 */
function RestingRow({ items }: { items: ShowcaseItem[] }) {
  return (
    <div className={ROW} tabIndex={0} role="group" aria-label={ROW_LABEL}>
      {items.map((item) => (
        <div key={item.arxivId} className={`relative ${SLOT}`}>
          <span
            aria-hidden="true"
            data-scrub=""
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: "var(--site-radius-card)",
              boxShadow: "var(--site-shadow-card)",
            }}
          />
          <ShowcaseCard item={item} />
        </div>
      ))}
    </div>
  );
}

/** The row doing its job: one track, four windows onto it. */
function ScrubbedRow({ items }: { items: ShowcaseItem[] }) {
  const row = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(row);

  return (
    <div ref={row} className={ROW} tabIndex={0} role="group" aria-label={ROW_LABEL}>
      {items.map((item, i) => {
        const from = CARD_FROM + i * CARD_STEP;
        return (
          <Scrub
            key={item.arxivId}
            progress={progress}
            from={from}
            to={from + CARD_SPAN}
            y={24}
            scale={[0.96, 1]}
            lift="card"
            liftRadius="card"
            className={SLOT}
          >
            <ShowcaseCard item={item} />
          </Scrub>
        );
      })}
    </div>
  );
}

const ROW_LABEL = "Four tables from the validation corpus";

export function ShowcaseCards({ items }: { items: ShowcaseItem[] }) {
  const reduced = useReducedMotionGate();

  if (reduced) return <RestingRow items={items} />;
  return <ScrubbedRow items={items} />;
}
