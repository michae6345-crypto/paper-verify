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
 * On a narrow screen the four cards stack, the track gets three times longer,
 * and the windows all resolve early. That is the correct degradation: stacking
 * already sequences the cards by geometry, so the windows have nothing left to
 * do. Every window closes by 0.48, well before the last card is centred, so no
 * card can be sitting at zero opacity while it is on screen.
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

/** Where each card's window opens. The fourth closes at 0.48. */
const CARD_STARTS = [0.02, 0.06, 0.2, 0.24];
const CARD_SPAN = 0.24;

/** The six evidence rows, opening after the card that holds them. */
const ROW_START = 0.2;
const ROW_SPAN = 0.14;
const ROW_STEP = 0.035;

/** The closing paragraph, last. */
const NOTE_FROM = 0.36;
const NOTE_TO = 0.6;

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
 * `leads` is the one that quotes a real finding. `71.0` claimed against `70.944`
 * computed is the only concrete result on the page, and in a 2x2 of otherwise
 * equal cards nothing says which one to read first. It stands off the page and
 * the other three rest, which is the whole distinction those two tokens exist to
 * draw.
 */
function CheckCard({
  title,
  description,
  leads,
  children,
}: {
  title: string;
  description: string;
  leads?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex h-full flex-col items-start gap-4 p-8 three:p-10 ${
        leads ? "site-elevated" : "site-resting"
      }`}
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
            <Scrub
              key={card.title}
              progress={progress}
              from={from}
              to={from + CARD_SPAN}
              y={40}
              blur={6}
            >
              <CheckCard
                title={card.title}
                description={card.description}
                leads={Boolean(card.evidence)}
              >
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
