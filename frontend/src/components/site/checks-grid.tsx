"use client";

import { useRef, type ReactNode } from "react";

import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
import { Rail, Rise, WIDE, useWideLayout } from "@/components/site/motion/mobile";
import { Mono } from "@/components/site/ui";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";

/**
 * What runs today, and the one card that quotes a real finding.
 *
 * This exists as a separate file only because `checks.tsx` reads the committed
 * run reports off disk and so cannot be a client component. Every string here
 * arrives as a prop; nothing about a check is decided in this file.
 *
 * **Three cards, and the layout is no longer a grid of equals.** It was a 2x2 of
 * four cards under the heading "four checks, in two families", and both halves
 * of that were wrong. The taxonomy was a shape imposed on the work rather than
 * read off it, and two of the four cards asked the same question: `dead_links`
 * requests every URL the paper prints, `citation_existence` looks up every
 * reference, and both of them are "does the thing this paper points at exist".
 * They are one card now, naming both checkers so a reader who meets either in a
 * report still recognises it.
 *
 * With three, the arrangement can say something a 2x2 could not. The card
 * carrying the finding takes the full-height right column and the other two
 * stack beside it, so the one concrete result on the page is the tallest object
 * in the section rather than one quarter of a square. Document order is
 * unchanged: the placement classes are `three:` only, and below that breakpoint
 * the three go on a rail in the order they are given.
 *
 * The motion: one progress track spans the whole grid, and each card maps its
 * own window of it. Windows rather than delays, so a reader who flicks through
 * gets the whole sequence compressed instead of three animations queued behind a
 * scroll that has already finished.
 *
 * The evidence card gets the most of it. `71.0` claimed against `70.944`
 * computed is the only concrete result on this page, and six figures landing one
 * after another as the reader descends is worth more than a panel fading in
 * whole: the reader ends up having read each line rather than having seen a
 * block of monospace appear.
 *
 * Below `WIDE` the cards go on a rail. Stacked they were 1,500px of column, one
 * card to a screen, which is the wrong shape for a set a reader is meant to see
 * the extent of. On the rail it is one gesture, the whole group, the next card
 * visible at the edge.
 *
 * Nothing here is pinned. Three cards at this size exceed a 640px viewport at
 * every breakpoint, and a pinned section taller than the screen puts its own
 * lower half out of reach.
 */

export type CardSpec = {
  title: string;
  description: string;
  /**
   * The checker names behind a card that stands for more than one of them.
   * Only the merged card carries these; a card bound to a single checker is
   * already titled with that checker's own `display_name`.
   */
  checkers?: string[];
  /** Present on the one card that quotes a real finding. */
  evidence?: Evidence;
};

export type Evidence = {
  paperId: string;
  paperName: string;
  locator: string;
  claimed: string;
  computed: string;
  delta: string;
  verdict: Verdict;
};

/**
 * Where each card's window opens, and it is the grid's own geometry rather than
 * three numbers that looked reasonable.
 *
 * The track is the grid, about 470px tall at 1536 x 720, so travel is near
 * 1190px. The two cards in the left column are 246px apart, which is the 0.207
 * between the first window and the third, and that gap is where the separation
 * between the top of the grid and the bottom of it comes from. Only the 0.03
 * between the first card and the tall one is authored, because those two are
 * side by side and geometry has nothing to say about which is read first.
 *
 * The rule these are placed against, from `motion/scrub.tsx`: an element's
 * window should open on the frame its top edge reaches the fold, which is its
 * own offset over the travel, and close before its centre reaches the middle of
 * the screen, which is where it is being read. A window that closes early costs
 * a little movement. A window that opens late costs the reader the content.
 */
const CARD_STARTS = [0.0, 0.03, 0.207];

/** 0.30 of 1190px is 357px of scrolling, comfortably inside the surface budget. */
const CARD_SPAN = 0.3;

/**
 * Where in the grid each card sits above `three:`.
 *
 * Static strings rather than a template, because Tailwind reads the source for
 * class names and cannot see one that is assembled at runtime. The left column
 * takes cards in the order they arrive and the card carrying evidence takes the
 * right column whole, so moving the finding to a different card moves the tall
 * column with it.
 */
const LEFT_ROWS = ["three:row-start-1", "three:row-start-2", "three:row-start-3"];
const LEAD_PLACEMENT = "three:col-start-2 three:row-start-1 three:row-span-2";

function placements(cards: CardSpec[]): string[] {
  let left = 0;
  return cards.map((card) =>
    card.evidence
      ? LEAD_PLACEMENT
      : `three:col-start-1 ${LEFT_ROWS[Math.min(left++, LEFT_ROWS.length - 1)]}`,
  );
}

/**
 * The six evidence rows, opening after the card that holds them.
 *
 * Their `from` values are geometric, but the step is 0.03 rather than the 0.019
 * the row spacing works out to, and that is deliberate. These six should read as
 * figures landing one after another; at the geometric spacing they are 26px of
 * scrolling apart, which arrives as one event. 0.03 is around 36px, far enough
 * apart to count them and still an 89% overlap between neighbours, so a fast
 * scroll compresses them into one gesture instead of queueing six.
 */
const ROW_START = 0.1;
const ROW_SPAN = 0.28;
const ROW_STEP = 0.03;

/**
 * One of the three.
 *
 * Opaque, and carrying the elevation tokens. These were `rgba(255,255,255,0.5)`
 * and no shadow, which is a card that is neither on the page nor off it: half
 * the field showing through it, and no elevation to say which side of the field
 * it is on. A translucent pane cannot be lifted convincingly either, because a
 * shadow under something you can see through is a contradiction the eye resolves
 * as dirt.
 *
 * The one that quotes a real finding stands off the page and the other two rest.
 * Which token a card gets is decided by the presence of evidence, one level up,
 * where the scrub that carries the shadow lives.
 */
function CheckCard({
  title,
  description,
  checkers,
  children,
}: {
  title: string;
  description: string;
  checkers?: string[];
  children?: ReactNode;
}) {
  return (
    // No shadow class. The elevation is on a scrubbed layer outside this card so
    // that it arrives with it; the card only decides its own fill and padding.
    // Two shadows on one surface reads as fog.
    //
    // `p-6` below the breakpoint. At 390 the gutter takes 48 and the reference's
    // 32px of card padding took another 64, leaving a 278px measure for a
    // paragraph, about 34 characters, which is half of what a line of body copy
    // wants. 24 gives it 294 and the difference is a line of text per card.
    <div
      className="flex h-full w-full flex-col items-start gap-3 p-6 two:gap-4 two:p-8 three:p-10"
      style={{ background: "var(--site-card)", borderRadius: "var(--site-radius-inner)" }}
    >
      <h3
        style={{
          fontSize: "clamp(18px, 1.6vw, 24px)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          lineHeight: 1.4,
          color: "var(--site-ink)",
        }}
      >
        {title}
      </h3>
      <p className="site-body" style={{ fontSize: "15px" }}>
        {description}
      </p>
      {/* The checker names, for the card that stands for two of them. A reader
          who meets `dead_links` at the top of a report should be able to find
          which card on this page described it. */}
      {checkers && (
        <p className="mt-auto pt-2" style={{ fontSize: "13px", color: "var(--site-muted)" }}>
          {checkers.map((name, i) => (
            <span key={name}>
              {i > 0 && ", "}
              <Mono>{name}</Mono>
            </span>
          ))}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * One label/value pair on the evidence card.
 *
 * 13px rather than 12 below the breakpoint. Twelve is the floor for body text
 * and this is a table of figures a reader is meant to compare, `71.0` against
 * `70.944`, at arm's length on a phone rather than at desk distance.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-baseline justify-between gap-4">
      <span
        className="shrink-0 text-[13px] two:text-[12px]"
        style={{ lineHeight: 1.5, color: "var(--site-muted)" }}
      >
        {label}
      </span>
      <span
        className="min-w-0 text-right text-[13px] two:text-[12px]"
        style={{ lineHeight: 1.5, color: "var(--site-ink)" }}
      >
        {children}
      </span>
    </div>
  );
}

/** The six rows, built once so both branches quote the same finding. */
function evidenceRows(evidence: Evidence): { label: string; value: ReactNode }[] {
  return [
    {
      label: "Paper",
      value: (
        <>
          <Mono>{evidence.paperId}</Mono>, {evidence.paperName}
        </>
      ),
    },
    { label: "Source", value: <Mono>{evidence.locator}</Mono> },
    { label: "Claimed", value: <Mono>{evidence.claimed}</Mono> },
    { label: "Computed", value: <Mono>{evidence.computed}</Mono> },
    { label: "Delta", value: <Mono>{evidence.delta}</Mono> },
    {
      label: "Verdict",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <VerdictGlyph verdict={evidence.verdict} size={12} />
          {VERDICT_LABEL[evidence.verdict]}
        </span>
      ),
    },
  ];
}

/**
 * The well the rows sit in.
 *
 * A well, not a card. This sits inside a card that is already standing off the
 * page, and a second shadow on top of that one reads as fog rather than as two
 * levels, so it goes down instead of up. The fill is the page field, so it reads
 * as punched into the card rather than laid on it.
 */
function EvidenceWell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-1 flex w-full flex-col gap-2 p-4 two:mt-2 two:p-5"
      style={{ background: "var(--site-base)", borderRadius: "12px" }}
    >
      {children}
    </div>
  );
}

/** The evidence panel: six rows, each on its own slice of the grid's travel. */
function EvidencePanel({
  evidence,
  progress,
}: {
  evidence: Evidence;
  progress: ReturnType<typeof useSectionProgress>;
}) {
  return (
    <EvidenceWell>
      {evidenceRows(evidence).map((row, i) => {
        const from = ROW_START + i * ROW_STEP;
        return (
          <Scrub key={row.label} progress={progress} from={from} to={from + ROW_SPAN} y={8}>
            <Row label={row.label}>{row.value}</Row>
          </Scrub>
        );
      })}
    </EvidenceWell>
  );
}

/**
 * The same six rows on the rail, each measured against its own travel.
 *
 * The stagger is authored rather than geometric, and this is one of the places
 * where that is the right answer: the six rows are 22px apart, so measured
 * against themselves they would arrive within a few pixels of each other and
 * land as one block of monospace. 0.03 of a row's travel is about 28px of
 * scrolling, far enough apart to count them and still leaving neighbours
 * overlapping by more than nine tenths.
 */
function RailEvidence({ evidence }: { evidence: Evidence }) {
  return (
    <EvidenceWell>
      {evidenceRows(evidence).map((row, i) => (
        <Rise key={row.label} lead={i * 0.03} y={8}>
          <Row label={row.label}>{row.value}</Row>
        </Rise>
      ))}
    </EvidenceWell>
  );
}

/**
 * The paragraph under the grid, measured against itself.
 *
 * It used to hold a window in the grid's travel, which put it past 0.48 of a
 * track it is not on: the note sits below the grid, so a fraction of the grid's
 * progress describes where the grid is, not where the note is. `Rise` gives it
 * its own track, starting when the note reaches the fold and ending when it
 * leaves the top, whatever is above it, so nothing has to be right twice for the
 * grid layout and for the rail. The rule worth taking from it: an element whose
 * place in its section changes with the layout should be measured against
 * itself.
 */
function ClosingNote({ children }: { children: ReactNode }) {
  return (
    <Rise y={20} boxClassName="mt-8 two:mt-10">
      {children}
    </Rise>
  );
}

/** Above the breakpoint: two stacked cards and one tall one, on the grid's travel. */
function CardGrid({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(grid);
  const place = placements(cards);

  return (
    <>
      <div
        ref={grid}
        className="site-stack grid gap-6 three:grid-cols-[1fr_1.04fr] three:gap-10"
      >
        {cards.map((card, i) => {
          const from = CARD_STARTS[Math.min(i, CARD_STARTS.length - 1)];
          return (
            // No blur, and 12px of travel rather than 40. Section 4 of the
            // teardown spends blur exactly once, on the one element that
            // matters, and the hero's verdict is already that element. Three
            // cards resolving out of a 6px blur is the effect stated three times
            // in one section, and on a card carrying a table of figures it reads
            // as the page failing to render rather than as depth. 40px alongside
            // a scale is a slide from off screen, which the same sentence rules
            // out.
            <Scrub
              key={card.title}
              progress={progress}
              from={from}
              to={from + CARD_SPAN}
              y={12}
              scale={[0.96, 1]}
              lift={card.evidence ? "card" : "raised"}
              liftRadius="inner"
              className={place[i]}
            >
              <CheckCard
                title={card.title}
                description={card.description}
                checkers={card.checkers}
              >
                {card.evidence && <EvidencePanel evidence={card.evidence} progress={progress} />}
              </CheckCard>
            </Scrub>
          );
        })}
      </div>

      <ClosingNote>{children}</ClosingNote>
    </>
  );
}

/**
 * Below it: the three on a rail, and the note under it.
 *
 * The cards are the one group here whose members sit at the same height as each
 * other, so the geometric stagger every other narrow-viewport group gets for
 * free is not available. `lead` is what replaces it, and 0.035 of a card's
 * travel is about 40px of scrolling between one and the next. They still overlap
 * by nine tenths, so the three arrive as one object with an internal order
 * rather than as a queue.
 *
 * The evidence card keeps the heavier elevation, and on a rail that distinction
 * does more work than it does in a grid: it is the only thing saying which card
 * to read first when one and a half of them are on screen.
 */
function CardRail({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  return (
    <>
      <Rail label="What runs on a paper today" className="site-stack">
        {cards.map((card, i) => (
          <Rise
            key={card.title}
            lead={i * 0.035}
            kind="surface"
            y={12}
            scale={[0.96, 1]}
            lift={card.evidence ? "card" : "raised"}
            liftRadius="inner"
            boxClassName="flex w-full"
            className="flex w-full"
          >
            <CheckCard title={card.title} description={card.description} checkers={card.checkers}>
              {card.evidence && <RailEvidence evidence={card.evidence} />}
            </CheckCard>
          </Rise>
        ))}
      </Rail>

      <ClosingNote>{children}</ClosingNote>
    </>
  );
}

export function ChecksGrid({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  const wide = useWideLayout(WIDE);

  if (wide) return <CardGrid cards={cards}>{children}</CardGrid>;
  return <CardRail cards={cards}>{children}</CardRail>;
}
