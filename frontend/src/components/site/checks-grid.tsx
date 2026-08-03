"use client";

import { useRef, type ReactNode } from "react";

import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";
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
 * On a narrow screen the four cards stack, the track gets roughly three times
 * longer, and every window resolves earlier in the element's own travel than it
 * does here. That is the correct degradation and it is safe in the direction
 * that matters: stacking already sequences the cards by geometry, so the windows
 * have nothing left to do, and a window that closes early costs movement rather
 * than content. The direction to watch is the other one, and it is checked at
 * five viewports rather than argued about.
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
    <div
      className="flex h-full flex-col items-start gap-4 p-8 three:p-10"
      style={{ background: "var(--site-card)", borderRadius: "var(--site-radius-inner)" }}
    >
      <h3
        style={{
          fontSize: "clamp(18px, 1.6vw, 24px)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          lineHeight: 1.6,
          color: "var(--site-ink)",
        }}
      >
        {title}
      </h3>
      <p className="site-body">{description}</p>
      {children}
    </div>
  );
}

/** One label/value pair on the evidence card. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--site-muted)" }}>{label}</span>
      <span
        className="text-right"
        style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--site-ink)" }}
      >
        {children}
      </span>
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
  const rows: { label: string; value: ReactNode }[] = [
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

  return (
    // A well, not a card. This sits inside a card that is already standing off
    // the page, and a second shadow on top of that one reads as fog rather than
    // as two levels — so it goes down instead of up. The fill is the page field,
    // so it reads as punched into the card rather than laid on it, and it was
    // white on white the moment the card behind it stopped being translucent.
    <div
      className="mt-2 flex w-full flex-col gap-2 p-5"
      style={{ background: "var(--site-base)", borderRadius: "12px" }}
    >
      {rows.map((row, i) => {
        const from = ROW_START + i * ROW_STEP;
        return (
          <Scrub key={row.label} progress={progress} from={from} to={from + ROW_SPAN} y={8}>
            <Row label={row.label}>{row.value}</Row>
          </Scrub>
        );
      })}
    </div>
  );
}

export function ChecksGrid({ cards, children }: { cards: CardSpec[]; children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(grid);

  return (
    <>
      <div ref={grid} className="mt-10 grid gap-6 three:mt-12 three:grid-cols-2 three:gap-10">
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
