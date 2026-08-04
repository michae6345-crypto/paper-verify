"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MotionValue, motion, useTransform } from "motion/react";

import { DrawLine, Pin, Scrub, useReducedMotionGate } from "@/components/site/motion/scrub";
import { CoverUp, Rise, useBoxHeight, useScoreTrack } from "@/components/site/motion/mobile";
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
 * its own lower half.** `Pin`'s sticky child is exactly `100dvh` and it does not
 * scroll. Anything below its fold is unreachable, with no scrollbar to recover
 * it, and the frame clips, so the missing half looks like a design decision
 * rather than a fault. This is the failure the whole page is built to avoid.
 *
 * **Every number below was measured in a headless Chromium, not derived.** The
 * previous version of this comment was derived, and two of its lines were wrong
 * in the same direction. It put the heading at 56, but `clamp(28px, 3.6vw, 48px)`
 * at line-height 1.4 measures **67.2** at any width where `3.6vw` reaches the
 * 48px ceiling, which is everything above 1333. And it claimed the lede "drops to
 * one line and gives back 27" on a wide viewport, which a 70ch measure never
 * does: it is two lines at 1920 exactly as it is at 1100. The real budget was
 * **799**, not 789, and it grew with viewport width instead of shrinking.
 *
 * That is the same shape of error as the gate itself. A budget nobody opened a
 * browser to check is a budget that is probably wrong, and this one turned the
 * page's signature scroll moment off for every ordinary visitor: a 1920 x 1080
 * screen at the 125% scaling Windows ships by default reports an `innerHeight`
 * of **720**, and the gate asked for 860. `scripts/check-viewports.mjs` measures
 * it now, at that viewport, and fails the build script if this section stops
 * pinning there.
 *
 * Measured at 1536 x 720 and again at the 1100 x 700 floor:
 *
 *      64  header clearance. The bar is fixed and condenses to 64 (`SHORT` in
 *          `site-header.tsx`) over the first 140px of scroll. This section is
 *          far enough down the page that it is only ever seen at 64, so the old
 *          72 was clearing a bar that is not there.
 *      95  the header row: a 29px tag, 10px of gap, and a 56px heading, with the
 *          lede beside it rather than under it
 *      20  gap
 *     386  the well: a 334px panel inside 26px of shadow margin
 *      20  gap
 *      39  the tally row, one line of pills
 *      32  bottom
 *     ---
 *     656  against 700, so 44 spare at the floor and 64 at the viewport that
 *          prompted this. The frame centres its contents, so that spare is split
 *          top and bottom and overflow would appear at both ends at once.
 *
 * **The budget is flat, which is the property that makes a `min-height` query
 * able to answer it.** Two changes buy that, and they are the same two `hero.tsx`
 * made:
 *
 *   - The heading is capped at 40px inside the pin (`PINNED_HEADING`) rather than
 *     the 48 the rest of the page uses. `3.6vw` reaches 40 at 1112, so from just
 *     above the 1100 floor to any width at all the heading box is 56 and stops
 *     tracking the viewport. The static branch keeps the full 48.
 *   - The lede sits in a narrow right-hand column beside the heading instead of
 *     under it. That is `MOTION_TEARDOWN.md` §5's density pattern rather than a
 *     saving invented here, and it is what makes the lede's own wrapping free:
 *     the row is as tall as the taller column, the tag-and-heading column is 95,
 *     and the lede would have to reach **four** lines (109) before it added a
 *     single pixel. At its 34ch measure it sets in two.
 *
 * Where the other ~130px came from, and what was refused:
 *
 *   - 46 out of the panel, which is budgeted line by line in `PanelFrame`. No
 *     type size in the table changed; the leading did.
 *   - 8 off the header clearance, above.
 *   - 8 off the two stack gaps, 24 to 20.
 *   - **Not** `WELL_PAD`, which stays 26. It is the room the halo's ring and drop
 *     need, and clipping a shadow to save 12px would put a hard horizontal edge
 *     across the bottom of the well.
 *   - **Not** the tally, and **not** a column of the table. The tally is the key
 *     to the marks, and this is a section about not discarding data.
 *
 * Below 1100 x 700 there is no pin at all: `StaticApparatus` stacks the two
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

const PANEL_H = 334;
/** The panel's own margin. 24 rather than 28: see the budget in `PanelFrame`. */
const PANEL_PAD = 24;
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
 * widest thing in the table is a *header*, not a value. Measured at the 1100px
 * pin threshold: the stack is 1004 wide, the well takes 26 of it on each side,
 * leaving 952 of panel; the panel takes 24 on each side, leaving 904 of content;
 * and 904 - 40 - 128 leaves 81.8px for each of the nine numeric columns.
 * `MNLI-(m/mm)` at 11px is 72.6px and `86.7/85.9` at 12px is 64.8px, so the
 * header is the binding constraint and it clears with 9.2px to spare.
 *
 * Two corrections to the version of this note that stood here before, both found
 * by measuring rather than by reading it again. It went straight from the 1004
 * container to the panel and forgot the well's own 26px each side, so its 948
 * was 952 minus nothing; and trimming the panel's padding from 28 to 24 for the
 * height budget moved this the *safe* way, from 80.9px per column to 81.8. The
 * height cut did not cost the table any width.
 */
const LABEL_W = 128;
/** Cell padding, kept small for the reason above. */
const CELL_PAD = 4;

/**
 * The table's vertical rhythm, and the only place the height cut is visible.
 *
 * 3px of lead, a 15px value line, and the 10px strip that carries the mark. It
 * was 4 / 16 / 12, and five body rows at 32 were 20 of the ~130px this section
 * had to find. **No type size changed**: values are still 12px, row labels and
 * headers still 11. What tightened is the leading and the strip, and the strip
 * is now exactly the 10px the glyph is drawn at rather than 12 with air around
 * it. A row of digits at 12px in a 15px line box is a dense table, which is what
 * a results table in a paper is; a row of digits at 10px would be a smaller
 * table, which is the thing that was not worth doing to make a pin fit.
 *
 * `ROW_LEAD + VALUE_H + STRIP_H` must equal `ROW_H`. The `height` on a `td` is a
 * minimum, so if these stop agreeing the rows silently grow and the panel clips
 * its own foot instead of failing loudly.
 */
const ROW_H = 28;
const ROW_LEAD = 3;
const VALUE_H = 15;
const STRIP_H = 10;

/**
 * The two header rows of the source table. The first carries the air above the
 * table, the second sits directly on the rule under it.
 */
const HEAD_H = [20, 18];

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
 * The frame both panels are, and the 334px budget it holds:
 *
 *      24  padding
 *      18  the head line: paper id, table label, which reading this is
 *      12  gap
 *     180  the grid: two header rows at 20 and 18, a rule, five body rows at 28,
 *          and the rule the source draws between its two blocks
 *      21  slack, collected in one flexing spacer so nothing else has to be
 *          exact and so `height: auto` degrades cleanly
 *       1  the apparatus rule
 *      10  gap
 *      44  two foot lines at 20, with a 4px gap
 *      24  padding
 *     ---
 *     334
 *
 * It was 380, and the 46 came off the five things that were air: 8 of padding,
 * 6 of the gap under the head line, 26 out of the grid (6 off the two header
 * rows, 20 off the five body rows at `ROW_H`), 2 off the gap above the foot, and
 * 4 out of the slack, which is 21 now rather than 25.
 *
 * What is deliberately untouched is the foot: two lines at 20px, in both panels.
 * They carry the apparatus entry (the one finding in this table, with its
 * claimed, computed and delta) and the sentence about the five two-valued
 * cells. Those two lines are the argument the section exists to make, and a
 * panel that fits by dropping them would be a panel about nothing.
 *
 * The slack is a floor, not a target. It is `min-h-[14px] flex-1`, so if the
 * fixed content above ever grows past 320 the spacer stops absorbing it and the
 * foot is clipped by `overflow: hidden` rather than pushing the panel taller.
 * That is the safe direction, since the pin's budget cannot be broken from in
 * here, but it is silent, so the measurement script exists.
 */
function PanelFrame({
  tone,
  height,
  data,
  children,
}: {
  tone: Tone;
  /** A number inside the pin, `auto` stacked, `100%` in a grid stack that sizes both. */
  height: number | string;
  data: ApparatusData;
  children: ReactNode;
}) {
  const p = PALETTE[tone];

  return (
    <div
      className={`${p.shadow} flex flex-col overflow-hidden`}
      style={{
        height,
        padding: PANEL_PAD,
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
      <div style={{ height: 12 }} />
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
                  height: HEAD_H[r] ?? HEAD_H[1],
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
                padding: `${ROW_LEAD}px 0 0`,
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
                  padding: `${ROW_LEAD}px ${CELL_PAD}px 0`,
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
    // and takes its natural height. Inside the pin all four foot lines measure
    // exactly the 904px of panel content at the 1100 floor with nothing
    // overflowing, so each stays on one line and the 334px budget holds.
    // Trimming the panel's padding to 24 gave this measure 8px more room; the
    // foot got safer, not tighter.
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

/* ---------------------------------------------------------------------------
   The section's own words. One copy of each, read by both branches, because a
   heading that says something different depending on the viewport is two
   headings to keep true.
   --------------------------------------------------------------------------- */

const TAG = "The apparatus";
const HEADING = "The same table, read twice";

/**
 * The heading size inside the pin. Lower than the 48px the rest of the page
 * reaches, and it is what stops this section's height budget following the
 * viewport's width. See `PinnedHeading`.
 */
const PINNED_HEADING = "clamp(28px, 3.6vw, 40px)";

/**
 * The lede.
 *
 * It used to open "One table from 1810.04805, as the paper prints it and as the
 * run reads it", and that sentence is now gone rather than shortened for space:
 * both panels already carry the paper id, the table label and which reading they
 * are, on their own head lines, in the reader's eye at the same moment. What is
 * left is the part nothing else on the page says, and it is the claim the whole
 * section rests on.
 */
function lede(data: ApparatusData): string {
  return `Every mark comes from the committed report for ${data.paperId}.`;
}

/** The section tag. `SectionTag`'s type exactly, without its fire-once `Reveal`. */
function SectionName() {
  return (
    <span
      className="site-display block"
      style={{ fontSize: 24, lineHeight: 1.2, color: "var(--site-muted)" }}
    >
      {TAG}
    </span>
  );
}

/**
 * The heading as the static branch sets it: stacked, and at the page's full
 * heading size, because nothing down there is competing for height.
 *
 * Not `SectionTag`, for two reasons that hold in both branches. Its `Reveal` is
 * a fire-once entrance and everything inside a pin has to be scrubbed, and its
 * `max-w-[20ch]` heading wraps to three lines at any heading long enough to say
 * what this section is.
 */
function Heading({ data }: { data: ApparatusData }) {
  return (
    <header>
      <SectionName />
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
        {HEADING}
      </h2>
      <p className="site-body mt-4 max-w-[70ch]">{lede(data)}</p>
    </header>
  );
}

/**
 * The same heading inside the pin, where 165px of stacked header was the single
 * largest thing standing between this section and a viewport that people
 * actually have.
 *
 * Two differences from the static one, both of them height and neither of them
 * copy:
 *
 * **The lede sits beside the heading.** `MOTION_TEARDOWN.md` §5 reads the
 * reference's density as body copy confined to a narrow right-hand column with
 * the left kept open, so this is the reference's own arrangement rather than a
 * saving invented under pressure, but the saving is why it is here. A row is as
 * tall as its taller column: the tag and heading come to 95, the lede at 34ch
 * sets in two lines at 54, and it would have to reach four lines before it added
 * a pixel to the section. Stacked, those same two lines cost 70.
 *
 * That bound is the point. The recurring catastrophe on this page is a pinned
 * frame that overflows because something wrapped, and here wrapping is free
 * until it doubles.
 *
 * **The heading is capped at 40px.** `clamp(28px, 3.6vw, 48px)` measures 67.2 as
 * soon as `3.6vw` reaches the ceiling, so the old budget silently grew by 11px
 * on every viewport wide enough to matter. `3.6vw` passes 40 at 1112, which is
 * 12px above this section's own floor, so from just inside the gate outwards the
 * heading box is a flat 56. `hero.tsx` capped its headline for exactly this
 * reason and records the same finding: a budget that tracks viewport width is
 * not something a `min-height` media query can answer.
 *
 * `items-end` rather than `items-baseline`: the two columns hold different type
 * at different sizes, and aligning their last baselines would leave the lede
 * sitting below the heading's descenders on some faces and above them on others.
 * Their bottom edges are the thing that should agree.
 *
 * The `nowrap` on the heading is a guard, not a layout instruction. It is one
 * line at every width this branch runs at: measured at the 1100 floor the
 * heading is 465px and the lede 343, which with the 40px gap leaves 155 of the
 * row's 1004 unspent. The declaration is there so that a longer heading, some
 * day, breaks in the horizontal direction where the frame clips and someone sees
 * it, rather than in the vertical direction where it would quietly push the
 * bottom of the panel past the fold. The lede keeps the shrinking, which is the
 * column that can afford it: three lines still cost this row nothing.
 */
function PinnedHeading({ data }: { data: ApparatusData }) {
  return (
    <header className="flex items-end justify-between gap-10">
      <div>
        <SectionName />
        <h2
          className="mt-2.5"
          style={{
            fontSize: PINNED_HEADING,
            fontWeight: 400,
            letterSpacing: "-0.04em",
            lineHeight: 1.4,
            color: "var(--site-ink)",
            whiteSpace: "nowrap",
          }}
        >
          {HEADING}
        </h2>
      </div>
      <p className="site-body max-w-[34ch]">{lede(data)}</p>
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
  height: number | string;
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
      <div style={{ height: 10 }} />

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
  height: number | string;
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
      <div style={{ height: 10 }} />

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
        <Mono>{data.multiValueCells}</Mono> cells here hold more than one value. No check reads one
        as a single number.
      </span>
    </FootLine>
  );
}

/**
 * Has this viewport room for the pin?
 *
 * Deliberately not a Tailwind breakpoint, for the reason `hero.tsx` gives: the
 * constraint is height as much as width, and it decides which tree renders
 * rather than how one tree looks.
 *
 * **The height term is 700, and the previous 860 meant this section had never
 * pinned for an ordinary visitor.** A headless Chromium on a 1920 x 1080 screen
 * at the 125% scaling Windows ships by default reports `innerHeight` 720: the OS
 * scaling takes the screen to 1536 x 864 and the browser's own chrome takes
 * another ~144. Everyone on that machine got `StaticApparatus`, so the
 * panel-over-panel cover, which is the page's signature scroll moment and the
 * whole of `MOTION_TEARDOWN.md` §3, ran for nobody. Every static check passed the
 * whole time, because a `curl` of the HTML cannot see a pin that did not happen.
 *
 * An earlier version of this comment argued at length that 860 was principled:
 * that the hero can cap a headline but this section's tall element is a table
 * that cannot be capped, and that trimming would recover "about 24px" and leave
 * a margin too thin to be safe. The first half is true and the second half was
 * arithmetic, not measurement. Measured, the recoverable height was ~143: the
 * header row gives up 70 by putting the lede beside the heading instead of under
 * it, the heading gives up 11 by being capped the way the hero's is, the panel
 * gives up 46 of leading and padding, and the clearance and gaps give up 16. The
 * table keeps all ten of its columns and all five of its rows, and no type size
 * in it changed.
 *
 * **The width term is still 1100, and it is not about height at all.** It is the
 * measure: ten columns, a 40px siglum margin and a 128px label column need about
 * 1000px of container before the header cells start colliding, and `LABEL_W`
 * above works that through. A narrower viewport does not get a smaller table; it
 * gets the static branch, which scrolls the table sideways in its own box the
 * way a paper's table does on a phone.
 *
 * Below the gate `StaticApparatus` stacks both readings at natural height. That
 * is a smaller loss than a panel whose bottom rows cannot be reached, which is
 * why the floor here is 700 with 44px of measured slack rather than 660 with
 * none. `scripts/check-viewports.mjs` asserts both directions: that the section
 * pins at 1536 x 720, and that it does *not* pin below its own floor.
 */
function usePinnable(enabled: boolean) {
  const [pinnable, setPinnable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia("(min-width: 1100px) and (min-height: 700px)");
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
          // `pt-16` is 64: the fixed bar condenses to `SHORT` over the first
          // 140px of scroll and this section is nowhere near the top of the
          // page, so it is only ever seen at 64. The old 72 was clearing air.
          <Container className="flex h-full flex-col justify-center pt-16 pb-8">
            {/* One measure for all three, so the heading's left edge is the
                panel's left edge. `Container` runs to 1440 and the well caps at
                1200, and without this the two would part company above 1440. */}
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
              <PinnedHeading data={data} />
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
 * The panels take their natural height here rather than the pinned 334, and each
 * scrolls horizontally inside its own box. Ten columns and an apparatus entry
 * need about 800px and a phone has 390, and a table that scrolls sideways is
 * what a paper's table does on a phone. Squeezing it to fit would mean dropping
 * columns, which is the one thing a section about not discarding data can do
 * least of all.
 *
 * This is now the `prefers-reduced-motion` branch and nothing else, which is the
 * job it is actually right for. Its own comment already said why: "a panel that
 * has covered another panel is just a panel", so the resolved state of this
 * device is not a state but a motion, and the honest way to render it without
 * motion is both readings in document order. What it was *also* doing, until
 * now, was standing in for every viewport under 1100 — which meant the page's
 * signature scroll moment did not exist on a phone at all.
 */
function StaticApparatus({ data }: { data: ApparatusData }) {
  return (
    <section id="apparatus" className="site-section scroll-mt-20">
      <Container className="mx-auto max-w-[1200px]">
        <Heading data={data} />

        <div className="site-stack flex flex-col gap-6">
          <SideScroller>
            <PaperPanel data={data} height="auto" />
          </SideScroller>
          <SideScroller>
            <InstrumentPanel data={data} height="auto" />
          </SideScroller>
        </div>

        <div className="mt-8">
          <Tally data={data} />
        </div>
      </Container>
    </section>
  );
}

/**
 * The box a panel scrolls sideways inside.
 *
 * The bleed is the point: the scroller undoes the page gutter and reapplies it
 * as padding, so the table can use the whole width of the screen while its left
 * edge still lines up with the heading above it. Without that, a 390px phone was
 * reading a ten-column table through a 342px slot for no reason.
 *
 * 800px is the measure `LABEL_W`'s note works through — a 40px siglum margin, a
 * 128px label column, and nine numeric columns wide enough that `MNLI-(m/mm)`
 * does not collide with its neighbour.
 */
function SideScroller({ children }: { children: ReactNode }) {
  return (
    <div
      className="site-rail overflow-x-auto"
      style={{
        marginInline: "calc(var(--site-gutter) * -1)",
        paddingInline: "var(--site-gutter)",
      }}
    >
      <div className="min-w-[800px]">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The same device, off its pin.
   --------------------------------------------------------------------------- */

/**
 * Where in the well's own travel the score runs.
 *
 * The pin gets to hold the panels still for three screens and spend that whole
 * budget on the sequence. Off the pin there is no holding still, so the sequence
 * has to fit inside the stretch of scrolling where the well is actually in front
 * of the reader — which is a fraction of the well's travel by definition, and is
 * the one place on this page where a fraction is the right unit rather than the
 * wrong one.
 *
 * `useSectionProgress` on the well: 0 is its top edge at the fold, 1 is its
 * bottom leaving the top. At 390 x 844 the well is about 430px, so travel is
 * 1274 and the window below is 764px of scrolling for the whole score — the read
 * marks, the cover, forty-five verdict marks and the tally. About one screen of
 * thumb travel, run at the reader's pace and reversible, which is the property
 * the pin was there to buy and the only one of its properties that survives.
 *
 * The ends are where they are so nothing resolves off screen. At 0.16 the well's
 * top is 640px down, so the first read mark lands with the head of the table
 * showing; at 0.76 its top is at -124 and the tally below it is at about 460,
 * which is the middle of the screen.
 */
const MOBILE_SCORE_FROM = 0.16;
const MOBILE_SCORE_TO = 0.76;

/**
 * The well, off the pin: Panel A at rest, Panel B rising over it.
 *
 * Two differences from `Well`, and both are consequences of the panels no longer
 * having a height a constant can state.
 *
 * The panels are a **grid stack** — same column, same row, so the row is as tall
 * as the taller of them and both stretch to it. That is what `PANEL_H` does
 * inside the pin, done by layout instead of by a number. It matters more here
 * than it looks: the foot lines wrap differently at 800px than at 904, so
 * whichever panel is taller is not something this file can know, and a fixed
 * height picked for one of them would clip the other. `MultiValueNote` is on
 * Panel B and is the most important sentence on the panel; clipping it to make a
 * constant fit would be the section contradicting itself.
 *
 * And the travel is **measured**, because the distance Panel B has to clear is
 * the well including its 26px of shadow margin, which is only knowable once the
 * panels have laid out. See `CoverUp`.
 */
function MobileWell({ data, progress }: { data: ApparatusData; progress: MotionValue<number> }) {
  const well = useRef<HTMLDivElement>(null);
  const clearance = useBoxHeight(well);

  return (
    <div
      ref={well}
      className="relative overflow-clip"
      style={{ padding: WELL_PAD }}
    >
      <div className="grid">
        <div className="col-start-1 row-start-1">
          <PaperPanel data={data} height="100%" progress={progress} />
        </div>
        <CoverUp
          progress={progress}
          from={SLIDE_FROM}
          to={SLIDE_TO}
          clearance={clearance}
          className="col-start-1 row-start-1"
        >
          <InstrumentPanel data={data} height="100%" progress={progress} />
        </CoverUp>
      </div>
    </div>
  );
}

/**
 * The apparatus on a phone, and the answer to "what does a pinned section do
 * when it cannot pin".
 *
 * Not the pinned composition with the pin taken off. A pinned frame is one
 * viewport tall and its contents are budgeted against that; this well is 800px
 * wide and as tall as its own table, read through a horizontal scroller. What
 * carries across is the *score* — the same `READ_*`, `SLIDE_*`, `MATCH_*`,
 * `PENDING_*` and `TALLY_*` constants the pin uses, in the same order, because
 * the order is the argument and it does not change with the viewport. Only the
 * thing driving it changes: `useScoreTrack` stretches the well's own travel over
 * the score's 0..1 instead of a sticky track's.
 *
 * That is the whole of why this is worth having rather than dropping to the
 * static branch. The reader still watches the paper's own table get read: the
 * hairline accrues down the column the average check reads, the instrument
 * closes over the page, the one finding resolves in the margin with its siglum,
 * then eight `matches`, then thirty-six `not checked`, then the tally. On a
 * phone, at the reader's pace, backwards if they scroll back.
 */
function MobileApparatus({ data }: { data: ApparatusData }) {
  const track = useRef<HTMLDivElement>(null);
  const score = useScoreTrack(track, MOBILE_SCORE_FROM, MOBILE_SCORE_TO);

  return (
    <section id="apparatus" className="site-section scroll-mt-20">
      <Container className="mx-auto max-w-[1200px]">
        <Heading data={data} />

        <div ref={track} className="site-stack">
          <SideScroller>
            <MobileWell data={data} progress={score} />
          </SideScroller>
        </div>

        {/* The tally is the one thing here that does *not* take the score, and
            the reason is that it is the one thing that is not inside the well.
            Borrowed from the score it opened at 0.86 — which inside the pin is a
            point on a frame that is holding still, and out here is a point at
            which the tally has already travelled past the middle of the screen.
            Measured at 834 x 1112 it was at opacity 0 with its own centre
            dead centre. It sits below the panels, so geometry already sequences
            it after them; its own travel is all it needs. */}
        <Rise kind="row" y={12} boxClassName="mt-6">
          <Tally data={data} />
        </Rise>
      </Container>
    </section>
  );
}

export function ApparatusPanels({ data }: { data: ApparatusData }) {
  // The gate, not `motion`'s `useReducedMotion`, even though this branch is safe
  // today. It is safe by accident: `pinnable` also starts `false`, so both trees
  // agree on the first render whatever the hook says. That is not a property to
  // rely on — anyone who lets the pinned branch render without waiting for
  // `pinnable` reintroduces the hydration mismatch, and nothing here would say
  // so. `scrub.tsx` documents the hazard; this file should not be the one
  // exception that looks like a counter-example.
  const reduced = useReducedMotionGate();
  const pinnable = usePinnable(!reduced);

  if (reduced) return <StaticApparatus data={data} />;
  if (pinnable) return <PinnedApparatus data={data} />;
  return <MobileApparatus data={data} />;
}
