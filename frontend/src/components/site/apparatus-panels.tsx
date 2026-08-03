"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MotionValue, motion, useReducedMotion, useTransform } from "motion/react";

import { DrawLine, Pin, Scrub } from "@/components/site/motion/scrub";
import { Container, Mono } from "@/components/site/ui";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Verdict } from "@/types/run-report";

/* ---------------------------------------------------------------------------
   The contract with the server half.

   The types live here rather than in `apparatus.tsx` for the reason
   `checks-grid.tsx` gives: the client file is the one that renders, so it states
   what it needs, and the server file is what has to satisfy it. It also keeps a
   client module from importing anything out of a file that reaches for
   `node:fs`, even as an erased type import.
   --------------------------------------------------------------------------- */

export type ApparatusCell = {
  text: string;
  bold: boolean;
  /** `null` where there is nothing to adjudicate: headers and row labels. */
  verdict: Verdict | null;
  /** Set only on a cell a finding is anchored to. */
  siglum: string | null;
};

export type ApparatusRow = {
  /** The source draws a rule here: a block boundary, or the head of the body. */
  ruleAbove: boolean;
  cells: ApparatusCell[];
};

export type ApparatusEntry = {
  siglum: string;
  domId: string;
  claimed: string;
  computed: string;
  delta: string;
  verdict: Verdict;
};

export type ApparatusData = {
  paperId: string;
  tableLabel: string;
  caption: string;
  /** The checker whose reading Panel A marks, and the column it reads. */
  readChecker: string;
  readColumn: number | null;
  /** Both header rows of the source table, verbatim. */
  head: ApparatusCell[][];
  body: ApparatusRow[];
  entry: ApparatusEntry | null;
  /** Every verdict present in Panel B and how many cells carry it. */
  tally: { verdict: Verdict; count: number }[];
  /** Cells holding more than one value. The `86.7/85.9` shape. */
  multiValueCells: number;
};

/**
 * The signature moment, rendered. `apparatus.tsx` is the server half and owns
 * every string and every verdict below; this file owns the geometry and the
 * scroll.
 *
 * The device is `docs/MOTION_TEARDOWN.md` §3: two panels of identical geometry,
 * and the second physically covers the first. Not a crossfade and not a colour
 * morph. It slides.
 *
 * What identical geometry buys, and why it is enforced structurally rather than
 * by two components that happen to agree: the argument the section makes is that
 * these are two readings of one object. If a number moves by two pixels between
 * the panels, the object stops being one object and the section becomes a
 * before-and-after. So both panels are the same `PanelFrame` at the same
 * `PANEL_H`, with the same `PanelGrid` inside it at the same column widths and
 * the same `ROW_H`. The only things that differ are the field colour, what goes
 * in the 12px strip under each value, and the two lines in the foot.
 *
 * **The two materials, rather than the reference's two colours.** Theirs goes
 * near-black to royal blue, which is their palette and must not come across.
 * Ours goes paper to instrument: Panel A is `--site-card` with black ink,
 * because it is a printed page, and Panel B is `--field-deep`, because it is the
 * app reading it. That is §2's opposition, and the slide becomes the instrument
 * closing over the document.
 *
 * `--field-deep` (#0d0d0d) rather than `--site-deep` (#262626), and that is a
 * contrast measurement rather than a preference. `--v-pending` is a mandated
 * colour, it is the ink of the "not checked" mark, and it is the mark thirty-six
 * of the forty-five body cells carry. On #262626 it lands at 2.54:1 and fails
 * the 3:1 a non-text graphic needs; on #0d0d0d it clears at 3.23. The other four
 * verdict colours clear on both, so the deepest field is set by the quietest
 * mark, which is the right way round, since the quiet mark is the majority one.
 *
 * **Elevation.** Panel A rests (`--site-shadow-raised`); Panel B carries the
 * halo (`--site-shadow-halo`), which is what `ui.tsx` reserves it for: something
 * that has to read as detached from what it overlaps. The halo is also the only
 * one of the stacks that works here, and the reason is worth writing down. The
 * light sits top-left, so every drop offsets down and right, but Panel B rises
 * from below, so its leading edge is its *top* edge, and a down-right drop puts
 * that edge's shadow underneath the panel where nothing can see it. The halo's
 * 8px white ring is the one part of the system that is symmetric, so it is the
 * part that separates the rising edge from the panel underneath. The drop still
 * does its job at rest, falling down and right into the well's margin.
 *
 * That margin is why `WELL_PAD` is 26 and not 12: the halo's drop reaches 24px
 * below the box, and a well that clipped it would put a hard horizontal edge
 * across the bottom of the shadow.
 *
 * ---
 *
 * **The pin arithmetic, because a pinned frame taller than the viewport hides
 * its own lower half.** `Pin`'s sticky child is exactly `100dvh`. Measured
 * against the smallest viewport this pins on, 1100 x 860, the same threshold
 * `hero.tsx` uses, and one threshold for the page's two pinned sections is
 * better than two:
 *
 *      72  header clearance. The bar is fixed and condenses to 64, plus air.
 *      29  section tag, Instrument Serif italic 24px at line-height 1.2
 *      10  gap
 *      56  heading. clamp(28px, 3.6vw, 48px) is 39.6px at 1100 wide, at
 *          line-height 1.4. One line, so the heading is length-constrained:
 *          keep it under about 30 characters or this budget is wrong.
 *      16  gap
 *      54  lede, two lines of 16px at 1.7. Held to 70ch so it cannot become
 *          three lines on a wide viewport.
 *      24  gap
 *     432  the well: a 380px panel inside 26px of shadow margin
 *      24  gap
 *      40  the tally row, one line of pills
 *      32  bottom
 *     ---
 *     789  against 860.
 *
 * At 1440 wide the heading reaches its 48px ceiling and gains 11px, and the lede
 * drops to one line and gives back 27. The budget only gets looser above the
 * threshold, which is the direction it needs to fail in.
 *
 * The 380px panel is itself budgeted, in `PanelFrame`.
 *
 * Below 1100 x 860 there is no pin at all: `StaticApparatus` stacks the two
 * panels down the page at their natural height, both fully resolved. That is
 * also the `prefers-reduced-motion` branch, and it is a separate component
 * rather than an early return so that no scroll subscription is ever opened:
 * `useTransform` on forty-five cells that will never move is forty-five
 * subscriptions to nothing.
 *
 * Worth stating plainly, because it is the one thing the static branch cannot
 * reproduce: a panel that has covered another panel is just a panel. The
 * resolved state of this device is not a state, it is a motion. So the static
 * branch does not render the end frame; it renders both readings, stacked, in
 * document order, which is the argument made as a layout instead of as a slide.
 *
 * ---
 *
 * **Where the progressive marks went.** §3 accrues red crosses on Panel A as you
 * scroll, one or two then five then eight. Panel A here is the paper as printed
 * and carries no marks at all, so the accrual moves to two places. On Panel A, a
 * hairline underline draws down the column the average check reads, one cell at
 * a time: that is scope, not judgement, and it tells the reader where to look
 * before the verdicts land. On Panel B the marks resolve after it lands, in
 * `VERDICT_RANK` order: the finding first, then the eight `matches`, then the
 * thirty-six `not checked`. One, then eight, then thirty-six.
 *
 * A wash block behind the average column was the first version of the Panel A
 * mark and is gone. `--wash` is specified as a highlight behind one phrase per
 * section, five table cells was already a stretch, and a filled block behind
 * numbers reads as a highlighter pen. An underline in marginal ink is what an
 * editor collating witnesses actually draws, and it reuses the exact 12px strip
 * Panel B puts its glyphs in, which makes the two panels agree even harder.
 */

/* ---------------------------------------------------------------------------
   Geometry. Every number here is shared by both panels by construction.
   --------------------------------------------------------------------------- */

const PANEL_H = 380;
/** Room around the panels for the halo's ring and drop. See the note above. */
const WELL_PAD = 26;
const WELL_H = PANEL_H + WELL_PAD * 2;

/** The margin the apparatus writes its sigla in. Reserved in both panels. */
const SIGLUM_W = 40;
/**
 * The row-label column. The longest label in this table is `BiLSTM+ELMo+Attn`,
 * sixteen characters, and Fragment Mono advances at 0.6em, so 106px of glyphs
 * plus 8px of cell padding.
 *
 * What is left over is what sets the rest, and it is worth checking because the
 * widest thing in the table is a *header*, not a value. At the 1100px pin
 * threshold the container is 1004 wide, the panel takes 56 of it in padding, and
 * 948 - 40 - 128 leaves 86.7px for each of the nine numeric columns.
 * `MNLI-(m/mm)` at 11px is 72.6px and `86.7/85.9` at 12px is 64.8px, so the
 * header is the binding constraint and it clears with 6px to spare.
 */
const LABEL_W = 128;
/** Cell padding, kept small for the reason above. */
const CELL_PAD = 4;

/** 4px of lead, a 16px value line, and the 12px strip that carries the mark. */
const ROW_H = 32;
const VALUE_H = 16;
const STRIP_H = 12;

/* ---------------------------------------------------------------------------
   The scroll score. Windows in the pin's own 0..1 travel, never milliseconds,
   so a fast scroll compresses the sequence rather than queueing it.
   --------------------------------------------------------------------------- */

/** Panel A is legible and still for the first tenth. It is a table; let it be read. */
const READ_FROM = 0.1;
const READ_STEP = 0.04;
const READ_SPAN = 0.1;

/** The cover. One long window, because the reader should feel they are driving it. */
const SLIDE_FROM = 0.36;
const SLIDE_TO = 0.58;

/** The apparatus rule draws, then the entry under it resolves. */
const RULE_FROM = 0.56;
const RULE_TO = 0.66;
const ENTRY_FROM = 0.6;
const ENTRY_TO = 0.72;

/** The finding, first and alone. */
const FINDING_FROM = 0.58;
const FINDING_TO = 0.68;

/** Then the eight `matches`, left to right across the bolded row. */
const MATCH_FROM = 0.62;
const MATCH_STEP = 0.012;
const MATCH_SPAN = 0.1;

/** Then the thirty-six `not checked`, in reading order. Closes at 0.955. */
const PENDING_FROM = 0.68;
const PENDING_STEP = 0.005;
const PENDING_SPAN = 0.1;

const TALLY_FROM = 0.86;
const TALLY_TO = 0.98;

type Tone = "paper" | "instrument";

type PanelInk = {
  field: string;
  ink: string;
  muted: string;
  rule: string;
  /** Marginal ink: sigla, the apparatus rule, the reading marks. */
  margin: string;
  /** An elevation utility from `globals.css`, never a hand-written shadow. */
  shadow: string;
};

/**
 * The two materials. Every value is an existing token: the panels introduce no
 * colour of their own, and the light/dark pairs are the ones already defined
 * for hairlines and marginal ink.
 */
const PALETTE: Record<Tone, PanelInk> = {
  paper: {
    field: "var(--site-card)",
    ink: "var(--site-ink)",
    muted: "var(--site-muted)",
    rule: "var(--site-line-strong)",
    margin: "var(--siglum-paper)",
    shadow: "site-resting",
  },
  instrument: {
    field: "var(--field-deep)",
    ink: "#ffffff",
    muted: "var(--site-muted-invert)",
    rule: "var(--site-line-invert)",
    margin: "var(--siglum)",
    shadow: "site-halo",
  },
};

const READING: Record<Tone, string> = {
  paper: "as the paper prints it",
  instrument: "as the run reads it",
};

/* ---------------------------------------------------------------------------
   The panel.
   --------------------------------------------------------------------------- */

/**
 * The frame both panels are, and the 380px budget it holds:
 *
 *      28  padding
 *      18  the head line: paper id, table label, which reading this is
 *      18  gap
 *     206  the grid: two header rows at 24 and 20, a rule, five body rows at 32,
 *          and the rule the source draws between its two blocks
 *      25  slack, collected in one flexing spacer so nothing else has to be
 *          exact and so `height: auto` degrades cleanly
 *       1  the apparatus rule
 *      12  gap
 *      44  two foot lines at 20, with a 4px gap
 *      28  padding
 *     ---
 *     380
 */
function PanelFrame({
  tone,
  height,
  data,
  children,
}: {
  tone: Tone;
  height: number | "auto";
  data: ApparatusData;
  children: ReactNode;
}) {
  const p = PALETTE[tone];

  return (
    <div
      className={`${p.shadow} flex flex-col overflow-hidden`}
      style={{
        height,
        padding: 28,
        background: p.field,
        borderRadius: "var(--site-radius-card)",
        color: p.ink,
      }}
    >
      <div className="flex items-baseline justify-between gap-4" style={{ height: 18 }}>
        <span className="flex items-baseline gap-4" style={{ fontSize: 12, color: p.muted }}>
          <Mono>{data.paperId}</Mono>
          <Mono>{data.tableLabel}</Mono>
        </span>
        <span style={{ fontSize: 12, color: p.muted }}>{READING[tone]}</span>
      </div>
      <div style={{ height: 18 }} />
      {children}
    </div>
  );
}

/**
 * The table, identical in both panels.
 *
 * `site-mono` on the table element rather than a `Mono` around each of seventy
 * cells: the class is exactly what `Mono` applies, and putting it on the table
 * means a cell cannot be written here without tabular figures.
 *
 * Bold is rendered as weight 700 over a face that ships one weight, so the
 * browser synthesises it. That is accepted rather than worked around, because
 * bold is not decoration in this table: it is the thing `bold_extreme` checks,
 * and a panel that hid it would be hiding the subject. `table-layout: fixed`
 * with centred numeric cells means the synthesis cannot disturb the columns.
 */
function PanelGrid({
  data,
  tone,
  caption,
  renderMark,
  renderSiglum,
}: {
  data: ApparatusData;
  tone: Tone;
  caption: string;
  /** What goes in the 12px strip under a value. */
  renderMark: (rowIndex: number, colIndex: number, cell: ApparatusCell) => ReactNode;
  renderSiglum: (rowIndex: number, row: ApparatusRow) => ReactNode;
}) {
  const p = PALETTE[tone];
  const headWidths = data.head[0]?.slice(1) ?? [];

  return (
    <table
      className="site-mono w-full"
      style={{ tableLayout: "fixed", borderCollapse: "collapse" }}
    >
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col style={{ width: SIGLUM_W }} />
        <col style={{ width: LABEL_W }} />
        {headWidths.map((_, i) => (
          <col key={i} />
        ))}
      </colgroup>

      <thead>
        {data.head.map((row, r) => (
          <tr key={r}>
            <td aria-hidden="true" />
            {row.map((cell, c) => (
              <th
                key={c}
                scope="col"
                style={{
                  height: r === 0 ? 24 : 20,
                  padding: `0 ${CELL_PAD}px`,
                  fontSize: 11,
                  lineHeight: 1.2,
                  fontWeight: cell.bold ? 700 : 400,
                  textAlign: c === 0 ? "left" : "center",
                  verticalAlign: "bottom",
                  whiteSpace: "nowrap",
                  color: p.muted,
                }}
              >
                {cell.text}
              </th>
            ))}
          </tr>
        ))}
      </thead>

      <tbody>
        {data.body.map((row, r) => (
          <tr key={r} style={{ borderTop: row.ruleAbove ? `1px solid ${p.rule}` : undefined }}>
            <td
              style={{
                padding: "4px 0 0",
                fontSize: 11,
                lineHeight: `${VALUE_H}px`,
                textAlign: "center",
                verticalAlign: "top",
                color: p.margin,
              }}
            >
              {renderSiglum(r, row)}
            </td>

            {row.cells.map((cell, c) => (
              <td
                key={c}
                style={{
                  height: ROW_H,
                  padding: `4px ${CELL_PAD}px 0`,
                  verticalAlign: "top",
                  textAlign: c === 0 ? "left" : "center",
                }}
              >
                <span
                  className="block overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    height: VALUE_H,
                    lineHeight: `${VALUE_H}px`,
                    fontSize: c === 0 ? 11 : 12,
                    fontWeight: cell.bold ? 700 : 400,
                    color: p.ink,
                  }}
                >
                  {cell.text}
                </span>
                <span
                  className="flex items-center justify-center"
                  style={{ height: STRIP_H }}
                >
                  {renderMark(r, c, cell)}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The rule between the table and the apparatus under it. Static on paper, drawn on the instrument. */
function ApparatusRule({
  tone,
  progress,
}: {
  tone: Tone;
  progress?: MotionValue<number>;
}) {
  const p = PALETTE[tone];

  if (!progress) {
    return <div style={{ height: 1, background: p.rule }} />;
  }

  return (
    <svg className="h-px w-full" viewBox="0 0 1000 1" preserveAspectRatio="none">
      <g stroke={p.margin}>
        <DrawLine
          progress={progress}
          from={RULE_FROM}
          to={RULE_TO}
          d="M0 0.5 H1000"
          strokeWidth={1}
        />
      </g>
    </svg>
  );
}

/** The gap between fields on a foot line. `gap-x-6`, stated so the entry can align to it. */
const FOOT_GAP = 24;

/** One foot line. Two of them in every panel, so the two panels end at the same height. */
function FootLine({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    // Wrapping matters only in the static branch, where the panel is 800px wide
    // and takes its natural height. Inside the pin the entry measures 699px
    // against 948 of panel, so it stays on one line and the 380px budget holds.
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-1"
      style={{ minHeight: 20, fontSize: 12, lineHeight: "20px", color: PALETTE[tone].muted }}
    >
      {children}
    </div>
  );
}

/** `claimed 71.0`, and the five other pairs beside it. */
function Field({ label, tone, children }: { label: string; tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span>{label}</span>
      <span style={{ color: PALETTE[tone].ink }}>{children}</span>
    </span>
  );
}

/** The apparatus entry: the one finding in this table, cited the way an apparatus cites a witness. */
function Entry({ data, tone }: { data: ApparatusData; tone: Tone }) {
  if (!data.entry) return null;
  const e = data.entry;

  return (
    <FootLine tone={tone}>
      {/* The siglum block plus the line's own gap is exactly SIGLUM_W, so the
          mark in the entry sits under the mark in the margin and the entry
          begins where the table's first column begins. That column of sigla
          running down the panel is the point of the whole device: it is how a
          reader gets from a cell to the record of what was done to it. */}
      <span
        className="site-mono"
        style={{
          color: PALETTE[tone].margin,
          width: SIGLUM_W - FOOT_GAP,
          textAlign: "center",
        }}
      >
        {e.siglum}
      </span>
      <Mono>{e.domId}</Mono>
      <Field label="claimed" tone={tone}>
        <Mono>{e.claimed}</Mono>
      </Field>
      <Field label="computed" tone={tone}>
        <Mono>{e.computed}</Mono>
      </Field>
      <Field label="delta" tone={tone}>
        <Mono>{e.delta}</Mono>
      </Field>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <VerdictGlyph verdict={e.verdict} size={12} />
        <span style={{ color: PALETTE[tone].ink }}>{VERDICT_LABEL[e.verdict]}</span>
      </span>
    </FootLine>
  );
}

/* ---------------------------------------------------------------------------
   The marks.
   --------------------------------------------------------------------------- */

/**
 * Each body cell's window, assigned in one pass so the stagger is a property of
 * the data rather than of where a component happens to sit in the tree.
 *
 * The order is `VERDICT_RANK`'s: the finding, then the eight `matches`, then the
 * thirty-six `not checked`. Most consequential first, which is the order the
 * glyph strip already uses everywhere else in the product.
 */
function markWindows(body: ApparatusRow[]): ([number, number] | null)[][] {
  let match = 0;
  let pending = 0;

  return body.map((row) =>
    row.cells.map((cell): [number, number] | null => {
      if (!cell.verdict) return null;
      if (cell.siglum) return [FINDING_FROM, FINDING_TO];
      if (cell.verdict === "not_attempted") {
        const from = PENDING_FROM + pending++ * PENDING_STEP;
        return [from, from + PENDING_SPAN];
      }
      const from = MATCH_FROM + match++ * MATCH_STEP;
      return [from, from + MATCH_SPAN];
    }),
  );
}

/** One verdict mark, resolving on its own slice of the pin's travel. */
function Mark({
  verdict,
  announce,
  progress,
  range,
}: {
  verdict: Verdict;
  announce: boolean;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0, 1], { clamp: true });

  return (
    <motion.span className="flex" style={{ opacity }}>
      {/* Only the cell carrying a finding announces itself. Thirty-six
          "not checked" announcements would bury the one that matters; the
          table's own caption carries the counts instead. */}
      <VerdictGlyph verdict={verdict} size={10} label={announce} />
    </motion.span>
  );
}

/** Panel A's mark: a hairline drawing under one value in the column being read. */
function ReadMark({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const from = READ_FROM + index * READ_STEP;
  const range: [number, number] = [from, from + READ_SPAN];
  const opacity = useTransform(progress, range, [0, 1], { clamp: true });
  const scaleX = useTransform(progress, range, [0.2, 1], { clamp: true });

  return (
    <motion.span
      aria-hidden="true"
      style={{
        opacity,
        scaleX,
        transformOrigin: "left center",
        display: "block",
        width: 22,
        height: 1,
        background: "var(--siglum-paper)",
      }}
    />
  );
}

/** The siglum in the margin, arriving with the mark it belongs to. */
function SiglumMark({
  siglum,
  progress,
}: {
  siglum: string;
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, [FINDING_FROM, FINDING_TO], [0, 1], { clamp: true });
  return (
    <motion.span className="site-mono block" style={{ opacity }}>
      {siglum}
    </motion.span>
  );
}

/* ---------------------------------------------------------------------------
   Copy and captions, assembled from the derived data rather than typed.
   --------------------------------------------------------------------------- */

function tallyPhrase(data: ApparatusData): string {
  return data.tally.map((t) => `${t.count} ${VERDICT_LABEL[t.verdict]}`).join(", ");
}

function paperCaption(data: ApparatusData): string {
  return `${data.tableLabel} from ${data.paperId}, as the paper prints it.`;
}

function instrumentCaption(data: ApparatusData): string {
  return `The same table with every mark the run made against it: ${tallyPhrase(data)}.`;
}

/** The column header the average check reads, so the copy names it from the data. */
function readColumnHeader(data: ApparatusData): string {
  if (data.readColumn === null) return "";
  return data.head[0]?.[data.readColumn]?.text ?? "";
}

/* ---------------------------------------------------------------------------
   The section.
   --------------------------------------------------------------------------- */

/**
 * One flex child, not three. Inside the pinned `Container` the gap is 24px, and
 * a fragment here would put that gap between the tag, the heading and the lede
 * as well, which is 48px the budget below does not have.
 *
 * Not `SectionTag`, for two reasons. Its `Reveal` is a fire-once entrance and
 * everything inside a pin has to be scrubbed, and its `max-w-[20ch]` heading
 * wraps to three lines at any heading long enough to say what this section is.
 * The type is `SectionTag`'s exactly, so the section still looks like the rest
 * of the page.
 */
function Heading({ data }: { data: ApparatusData }) {
  return (
    <header>
      <span
        className="site-display block"
        style={{ fontSize: 24, lineHeight: 1.2, color: "var(--site-muted)" }}
      >
        The apparatus
      </span>
      <h2
        className="mt-2.5"
        style={{
          fontSize: "clamp(28px, 3.6vw, 48px)",
          fontWeight: 400,
          letterSpacing: "-0.04em",
          lineHeight: 1.4,
          color: "var(--site-ink)",
        }}
      >
        The same table, read twice
      </h2>
      <p className="site-body mt-4 max-w-[70ch]">
        One table from {data.paperId}, as the paper prints it and as the run reads it. Every mark
        comes from the committed report.
      </p>
    </header>
  );
}

/** The key under the well: which marks this panel carries, and how many of each. */
function Tally({ data }: { data: ApparatusData }) {
  return (
    <ul className="flex flex-wrap items-center gap-2.5">
      {data.tally.map((t) => (
        <li key={t.verdict}>
          <span
            className="flex items-center gap-2.5 px-4 py-2"
            style={{
              background: "var(--site-card)",
              borderRadius: "var(--site-radius-pill)",
              fontSize: 13,
              color: "var(--site-ink)",
            }}
          >
            <VerdictGlyph verdict={t.verdict} size={12} />
            <span>
              <Mono>{t.count}</Mono> {VERDICT_LABEL[t.verdict]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Panel A's second foot line, arriving with the underline it explains.
 *
 * It names the checker and the column from the data rather than from a string
 * here, so if the corpus ever moves the finding to another column the sentence
 * moves with it instead of quietly becoming false.
 */
function ReadNote({ data }: { data: ApparatusData }) {
  const header = readColumnHeader(data);
  if (!header) return null;

  return (
    <FootLine tone="paper">
      <span>
        <Mono>{data.readChecker}</Mono> reads the column headed {header}.
      </span>
    </FootLine>
  );
}

/** Panel A. The paper, and the column the average check reads accruing under it. */
function PaperPanel({
  data,
  height,
  progress,
}: {
  data: ApparatusData;
  height: number | "auto";
  progress?: MotionValue<number>;
}) {
  return (
    <PanelFrame tone="paper" height={height} data={data}>
      <PanelGrid
        data={data}
        tone="paper"
        caption={paperCaption(data)}
        renderSiglum={() => null}
        renderMark={(r, c) => {
          if (data.readColumn === null || c !== data.readColumn) return null;
          if (!progress) {
            return (
              <span
                aria-hidden="true"
                style={{ display: "block", width: 22, height: 1, background: "var(--siglum-paper)" }}
              />
            );
          }
          return <ReadMark index={r} progress={progress} />;
        }}
      />

      <div className="min-h-[14px] flex-1" />
      <ApparatusRule tone="paper" />
      <div style={{ height: 12 }} />

      <div className="flex flex-col gap-1">
        {/* The caption is the paper's own, quoted, so it keeps the paper's
            capitalisation rather than taking ours. */}
        <FootLine tone="paper">{data.caption}</FootLine>
        {progress ? (
          <Scrub progress={progress} from={READ_FROM} to={READ_FROM + READ_SPAN} y={6}>
            <ReadNote data={data} />
          </Scrub>
        ) : (
          <ReadNote data={data} />
        )}
      </div>
    </PanelFrame>
  );
}

/** Panel B. The same cells, with the run's reading resolved onto them. */
function InstrumentPanel({
  data,
  height,
  progress,
}: {
  data: ApparatusData;
  height: number | "auto";
  progress?: MotionValue<number>;
}) {
  const windows = useMemo(() => markWindows(data.body), [data.body]);

  return (
    <PanelFrame tone="instrument" height={height} data={data}>
      <PanelGrid
        data={data}
        tone="instrument"
        caption={instrumentCaption(data)}
        renderSiglum={(_, row) => {
          const siglum = row.cells.find((cell) => cell.siglum)?.siglum;
          if (!siglum) return null;
          if (!progress) return <span className="site-mono block">{siglum}</span>;
          return <SiglumMark siglum={siglum} progress={progress} />;
        }}
        renderMark={(r, c, cell) => {
          if (!cell.verdict) return null;
          if (!progress) {
            return <VerdictGlyph verdict={cell.verdict} size={10} label={Boolean(cell.siglum)} />;
          }
          const range = windows[r]?.[c];
          if (!range) return null;
          return (
            <Mark
              verdict={cell.verdict}
              announce={Boolean(cell.siglum)}
              progress={progress}
              range={range}
            />
          );
        }}
      />

      <div className="min-h-[14px] flex-1" />
      <ApparatusRule tone="instrument" progress={progress} />
      <div style={{ height: 12 }} />

      <div className="flex flex-col gap-1">
        {progress ? (
          <>
            <Scrub progress={progress} from={ENTRY_FROM} to={ENTRY_TO} y={8}>
              <Entry data={data} tone="instrument" />
            </Scrub>
            <Scrub progress={progress} from={ENTRY_FROM + 0.04} to={ENTRY_TO + 0.04} y={8}>
              <MultiValueNote data={data} />
            </Scrub>
          </>
        ) : (
          <>
            <Entry data={data} tone="instrument" />
            <MultiValueNote data={data} />
          </>
        )}
      </div>
    </PanelFrame>
  );
}

/**
 * The second foot line, and the most important sentence on the panel.
 *
 * `CLAUDE.md` records that reading `86.7/85.9` as one number produced five false
 * `diverges` on this exact table. Five is also the number of cells in it that
 * hold more than one value, counted from the parse rather than typed here. The
 * marks in those cells say `not checked`, and this line says why.
 */
function MultiValueNote({ data }: { data: ApparatusData }) {
  if (!data.multiValueCells) return null;

  return (
    <FootLine tone="instrument">
      <span>
        <Mono>{data.multiValueCells}</Mono> cells in this table hold more than one value. No check
        reads one of them as a single number.
      </span>
    </FootLine>
  );
}

/**
 * Has this viewport room for the pin?
 *
 * Deliberately not a Tailwind breakpoint, for the reason `hero.tsx` gives: the
 * constraint is height as much as width, and it decides which tree renders
 * rather than how one tree looks. Same threshold as the hero.
 */
function usePinnable(enabled: boolean) {
  const [pinnable, setPinnable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia("(min-width: 1100px) and (min-height: 860px)");
    const update = () => setPinnable(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [enabled]);

  return pinnable;
}

/** The well: Panel A at rest, Panel B travelling up over it. */
function Well({ data, progress }: { data: ApparatusData; progress: MotionValue<number> }) {
  // Full travel is the whole well, so Panel B is outside the clip before it
  // starts rather than peeking at the bottom edge on the first frame.
  const y = useTransform(progress, [SLIDE_FROM, SLIDE_TO], [WELL_H, 0], { clamp: true });

  return (
    <div
      className="relative mx-auto w-full max-w-[1200px] overflow-hidden"
      style={{ height: WELL_H, padding: WELL_PAD }}
    >
      <div className="absolute" style={{ inset: WELL_PAD }}>
        <PaperPanel data={data} height={PANEL_H} progress={progress} />
      </div>
      <motion.div className="absolute" style={{ inset: WELL_PAD, y }}>
        <InstrumentPanel data={data} height={PANEL_H} progress={progress} />
      </motion.div>
    </div>
  );
}

function PinnedApparatus({ data }: { data: ApparatusData }) {
  return (
    <div id="apparatus" className="scroll-mt-20">
      <Pin height="320vh">
        {(progress) => (
          <Container className="flex h-full flex-col justify-center pt-[72px] pb-8">
            {/* One measure for all three, so the heading's left edge is the
                panel's left edge. `Container` runs to 1440 and the well caps at
                1200, and without this the two would part company above 1440. */}
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
              <Heading data={data} />
              <Well data={data} progress={progress} />
              <Scrub progress={progress} from={TALLY_FROM} to={TALLY_TO} y={12}>
                <Tally data={data} />
              </Scrub>
            </div>
          </Container>
        )}
      </Pin>
    </div>
  );
}

/**
 * Both readings, stacked and resolved, with no scroll subscription anywhere.
 *
 * The panels take their natural height here rather than the pinned 380, and each
 * scrolls horizontally inside its own box. Ten columns and an apparatus entry
 * need about 800px and a phone has 390, and a table that scrolls sideways is
 * what a paper's table does on a phone. Squeezing it to fit would mean dropping
 * columns, which is the one thing a section about not discarding data can do
 * least of all.
 */
function StaticApparatus({ data }: { data: ApparatusData }) {
  return (
    <section id="apparatus" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container className="mx-auto max-w-[1200px]">
        <Heading data={data} />

        <div className="mt-10 flex flex-col gap-6">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <PaperPanel data={data} height="auto" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <InstrumentPanel data={data} height="auto" />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Tally data={data} />
        </div>
      </Container>
    </section>
  );
}

export function ApparatusPanels({ data }: { data: ApparatusData }) {
  const reduced = useReducedMotion();
  const pinnable = usePinnable(!reduced);

  if (reduced || !pinnable) return <StaticApparatus data={data} />;
  return <PinnedApparatus data={data} />;
}
