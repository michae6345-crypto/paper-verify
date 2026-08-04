"use client";

import { useRef, type ReactNode } from "react";

import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
import { Rail, Rise, WIDE, useWideLayout } from "@/components/site/motion/mobile";
import { Mono } from "@/components/site/ui";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";

/**
 * The four check cards, and the one of them that carries evidence.
 *
 * This exists as a separate file only because `checks.tsx` reads the committed
 * run reports off disk and so cannot be a client component. Every string here
 * arrives as a prop; nothing about a check is decided in this file.
 *
 * The motion: one progress track spans the whole grid, and each card maps its
 * own window of it. Windows rather than delays, so a reader who flicks through
 * gets the whole sequence compressed instead of four animations queued behind
 * a scroll that has already finished.
 *
 * The evidence card gets the most of it. `71.0` claimed against `70.944`
 * computed is the only concrete result on this page, and six figures landing
 * one after another as the reader descends is worth more than a panel fading in
 * whole — the reader ends up having read each line rather than having seen a
 * block of monospace appear.
 *
 * On a narrow screen the four cards no longer stack. They were 2,000px of
 * column, one card to a screen, which is the wrong shape for the one thing this
 * section is saying: *four* checks, in two families. A set you cannot see the
 * extent of is not presented as a set. Below `WIDE` they go on a rail — one
 * gesture, the whole group, the next card visible at the edge — and the section
 * loses about 1,400px of page.
 *
 * The paragraph that used to be true here and no longer is, kept because the
 * reasoning is what changed rather than the layout: stacking *does* sequence
 * cards by geometry, so windows expressed in the grid's travel have nothing left
 * to do. What that argument missed is that they still have something to get
 * wrong. Measured at 390 x 844, three of the four cards and every one of the six
 * evidence rows was at an opacity between 0.02 and 0.39 on the frame its centre
 * crossed the fold — not resolved early, resolved *late*, which is the direction
 * that costs the reader the content. The grid's travel on a phone is nearly
 * three times what it is here, and none of these constants knew that. Below the
 * breakpoint every element is measured against itself instead; see
 * `motion/mobile.tsx`.
 *
 * Nothing here is pinned. Four cards at this size exceed a 640px viewport at
 * every breakpoint, and a pinned section taller than the screen puts its own
 * lower half out of reach.
 */

export type CardSpec = {
  title: string;
  description: string;
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
 * four numbers that looked reasonable.
 *
 * The track is the grid, 660px tall, so travel at a 720px viewport is 1380px.
 * The two rows of the grid are 350px apart, which is 0.25 of that travel, and
 * that gap is where the separation between the two groups comes from — §4 of the
 * teardown asks for windows that overlap heavily inside a group and are clearly
 * apart between groups, and here that falls straight out of the fact that the
 * second row is lower down the page. Only the 0.03 between the left and right
 * card of a row is authored, because those two are side by side and geometry has
 * nothing to say about which is read first.
 *
 * What these replace: `[0.02, 0.06, 0.2, 0.24]`, which opened the first card 27px
 * into a 1380px travel. Driving a browser through it showed the top-left card at
 * **opacity 0.64 and the two bottom cards at 0.95 and 0.78 on the frame their
 * centres first came over the fold** — three of the four had done most or all of
 * their animating below the fold, where the reader cannot be looking. That is the
 * whole of the "it fades in like a slow paint" complaint, and it was invisible
 * from the source, because a window can be perfectly well formed and still be
 * pointed somewhere nobody is looking.
 */
const CARD_STARTS = [0.0, 0.03, 0.341, 0.371];

/** 0.313 of 1380px is 432px of scrolling, against 331px before. */
const CARD_SPAN = 0.313;

/**
 * The six evidence rows, opening after the card that holds them.
 *
 * Their `from` values are geometric — the rows are 26px apart, which is 0.019 of
 * the travel — but the step is 0.035 rather than 0.019, and that is deliberate.
 * The doc comment above says these six should read as figures landing one after
 * another; at the geometric spacing they are 26px of scrolling apart, which
 * arrives as one event. 0.035 is 48px, far enough apart to count them and still
 * a 87% overlap between neighbours, so a fast scroll compresses them into one
 * gesture instead of queueing six.
 */
const ROW_START = 0.165;
const ROW_SPAN = 0.278;
const ROW_STEP = 0.035;

/** The closing paragraph, last. It sits below the grid, so its window is past 1. */
const NOTE_FROM = 0.489;
const NOTE_TO = 0.81;

/**
 * One of the four.
 *
 * These were `rgba(255,255,255,0.5)` and no shadow, which is a card that is
 * neither on the page nor off it: half the field showing through it, and no
 * elevation to say which side of the field it is on. A translucent pane cannot be
 * lifted convincingly either, because a shadow under something you can see
 * through is a contradiction the eye resolves as dirt. So they are opaque now and
 * they carry the elevation tokens.
 *
 * The one that quotes a real finding stands off the page and the other three
 * rest. `71.0` claimed against `70.944` computed is the only concrete result on
 * the page, and in a 2x2 of otherwise equal cards nothing says which one to read
 * first — which is the whole distinction those two tokens exist to draw. Which
 * token a card gets is decided by the presence of evidence, one level up, where
 * the scrub that carries the shadow lives.
 */
function CheckCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    // No shadow class. The elevation is on a scrubbed layer outside this card so
    // that it arrives with it; `leads` still decides *which* token, it is just
    // decided one level up now. Two shadows on one surface reads as fog.
    //
    // `p-6` below the breakpoint. At 390 the gutter takes 48 and the reference's
    // 32px of card padding took another 64, leaving a 278px measure for a
    // paragraph — about 34 characters, which is half of what a line of body copy
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
      {children}
    </div>
  );
}

/**
 * One label/value pair on the evidence card.
 *
 * 13px rather than 12 below the breakpoint. Twelve is the floor for body text
 * and this is a table of figures a reader is meant to compare — `71.0` against
 * `70.944` — at arm's length on a phone rather than at desk distance.
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
 * levels — so it goes down instead of up. The fill is the page field, so it
 * reads as punched into the card rather than laid on it, and it was white on
 * white the moment the card behind it stopped being translucent.
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
 * The stagger is authored rather than geometric, and this is one of the two
 * places on the page where that is the right answer: the six rows are 22px
 * apart, so measured against themselves they would arrive within a few pixels
 * of each other and land as one block of monospace. 0.03 of a row's travel is
 * about 28px of scrolling, which is far enough apart to count them and still
 * leaves neighbours overlapping by more than nine tenths.
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

/** Above the breakpoint: the 2x2, on the grid's own travel. */
function CardGrid({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(grid);

  return (
    <>
      <div ref={grid} className="site-stack grid gap-6 three:grid-cols-2 three:gap-10">
        {cards.map((card, i) => {
          const from = CARD_STARTS[Math.min(i, CARD_STARTS.length - 1)];
          return (
            // No blur, and 12px of travel rather than 40. §4 of the teardown
            // spends blur exactly once, on the one element that matters, and the
            // hero's verdict is already that element — four cards resolving out
            // of a 6px blur is the effect stated four times in one section, and
            // on a card carrying a table of figures it reads as the page failing
            // to render rather than as depth. 40px alongside a scale is a slide
            // from off screen, which §4 rules out in the same sentence that asks
            // for the scale.
            <Scrub
              key={card.title}
              progress={progress}
              from={from}
              to={from + CARD_SPAN}
              y={12}
              scale={[0.96, 1]}
              lift={card.evidence ? "card" : "raised"}
              liftRadius="inner"
            >
              <CheckCard title={card.title} description={card.description}>
                {card.evidence && <EvidencePanel evidence={card.evidence} progress={progress} />}
              </CheckCard>
            </Scrub>
          );
        })}
      </div>

      <Scrub progress={progress} from={NOTE_FROM} to={NOTE_TO} y={24}>
        {children}
      </Scrub>
    </>
  );
}

/**
 * Below it: the four on a rail, and the note under it.
 *
 * The four cards are the one group on this page whose members sit at the same
 * height as each other, so the geometric stagger every other narrow-viewport
 * group gets for free is not available — they would all arrive together. `lead`
 * is what replaces it, and 0.035 of a card's travel is about 40px of scrolling
 * between one and the next. They still overlap by nine tenths, so the four
 * arrive as one object with an internal order rather than as a queue.
 *
 * The evidence card keeps the heavier elevation. That distinction is the whole
 * reason both tokens exist, and on a rail it does more work than it does in a
 * grid: it is the only thing saying which of the four to read first when only
 * one and a half of them are on screen.
 */
function CardRail({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  return (
    <>
      <Rail label="The four checks" className="site-stack">
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
            <CheckCard title={card.title} description={card.description}>
              {card.evidence && <RailEvidence evidence={card.evidence} />}
            </CheckCard>
          </Rise>
        ))}
      </Rail>

      <Rise y={20} className="mt-2">
        {children}
      </Rise>
    </>
  );
}

export function ChecksGrid({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  const wide = useWideLayout(WIDE);

  if (wide) return <CardGrid cards={cards}>{children}</CardGrid>;
  return <CardRail cards={cards}>{children}</CardRail>;
}
