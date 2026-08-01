"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, type MotionValue } from "motion/react";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";

import type { Reading } from "./reading-data";
import { Label, TwoTone } from "./section";
import { useStage, useTrackProgress } from "./scrub";
import styles from "./scene.module.css";

/**
 * The signature scroll moment: one table, read twice.
 *
 * Two panels of identical geometry. The first is BERT's GLUE row as the paper
 * prints it, set on paper. The second is the same row with every reading
 * resolved, set in the instrument's own chrome, and it slides up and covers the
 * first as scroll advances. Not a crossfade and not a colour morph — the same
 * object, physically replaced by a second reading of itself.
 *
 * That is an apparatus criticus, which is the form `DESIGN_PLAN.md` committed
 * to and which has been solving this exact problem for about a thousand years:
 * record two readings, cite both witnesses, and decline to choose when the
 * evidence does not settle it.
 *
 * The number under each cell in the resolved panel is how many values the parser
 * read out of it, and it is the point of the whole device. `MNLI-(m/mm)` reads
 * `76.4/76.1` and carries a 2. Reading that cell as one number is the mistake
 * that produced five false divergences on this very table before it was caught.
 */

/** Where the resolved panel finishes covering the written one. */
const COVER_FROM = 0.26;
const COVER_TO = 0.52;
/** Where the rule under the resolved row draws, and the marks it passes. */
const DRAW_FROM = 0.56;
const DRAW_TO = 0.86;

function markAt(index: number, count: number): number {
  return DRAW_FROM + (DRAW_TO - DRAW_FROM) * ((index + 0.5) / count);
}

/** One cell: header, the value as printed, and a slot for its mark. */
function Cell({
  header,
  value,
  mark,
  opacity,
}: {
  header: string;
  value: string;
  mark?: ReactNode;
  opacity: MotionValue<number>;
}) {
  return (
    <motion.div className={`${styles.scrub} min-w-0`} style={{ opacity }}>
      <p
        className="t-num overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ color: "var(--mark)", fontSize: "10px", lineHeight: 1.4 }}
        title={header}
      >
        {header}
      </p>
      <p className="t-num mt-1.5" style={{ color: "var(--ink)", fontSize: "15px" }}>
        {value}
      </p>
      {/* Reserved in both panels, so the two grids are the same grid. */}
      <div className="mt-2 flex h-4 items-center">{mark}</div>
    </motion.div>
  );
}

function WrittenCell({
  index,
  header,
  value,
  progress,
}: {
  index: number;
  header: string;
  value: string;
  progress: MotionValue<number>;
}) {
  const at = 0.04 + index * 0.018;
  const opacity = useStage(progress, at, at + 0.05, [0, 1]);
  return <Cell header={header} value={value} opacity={opacity} />;
}

function ResolvedCell({
  index,
  count,
  header,
  value,
  mark,
  progress,
}: {
  index: number;
  count: number;
  header: string;
  value: string;
  mark: ReactNode;
  progress: MotionValue<number>;
}) {
  // The mark appears as the rule beneath the row reaches its column, so the
  // stagger is scroll distance rather than a queue of timers.
  const at = markAt(index, count);
  const opacity = useStage(progress, at, at + 0.02, [0, 1]);
  // The resolved cells arrive with their panel, so the cell itself never fades.
  const solid = useMotionValue(1);
  return (
    <Cell
      header={header}
      value={value}
      opacity={solid}
      mark={
        <motion.span className={`${styles.scrub} flex items-center`} style={{ opacity }}>
          {mark}
        </motion.span>
      }
    />
  );
}

/** The rule under the row, drawn against scroll with `stroke-dashoffset`. */
function Rule({ progress, dormant }: { progress: MotionValue<number>; dormant?: boolean }) {
  const offset = useStage(progress, DRAW_FROM, DRAW_TO, [1, 0]);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 1"
      preserveAspectRatio="none"
      className="h-px w-full"
      style={{ color: "var(--grid)", overflow: "visible" }}
    >
      <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="currentColor" vectorEffect="non-scaling-stroke" />
      {!dormant && (
        <motion.line
          className={styles.scrub}
          x1="0"
          y1="0.5"
          x2="100"
          y2="0.5"
          stroke="var(--ink)"
          pathLength={1}
          strokeDasharray="1 1"
          vectorEffect="non-scaling-stroke"
          style={{ strokeDashoffset: offset }}
        />
      )}
    </svg>
  );
}

function Panel({
  caption,
  children,
  footer,
  className,
}: {
  caption: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  className: string;
}) {
  return (
    <div
      className={`${className} flex h-full flex-col border p-5 two:p-8`}
      style={{ borderColor: "var(--grid)", borderRadius: "var(--radius-site-panel)" }}
    >
      <p className="t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
        {caption}
      </p>
      <div className="mt-7 flex-1">{children}</div>
      <div className="mt-7 min-h-[52px]">{footer}</div>
    </div>
  );
}

export function ReadingScene({ reduced, data }: { reduced: boolean; data: Reading }) {
  const track = useRef<HTMLDivElement>(null);
  const p = useTrackProgress(track, reduced);

  // Measured in its own height, so the resolved panel starts exactly one panel
  // below the written one and finishes exactly on top of it, whatever the box
  // turns out to be at this width.
  const coverPct = useStage(p, COVER_FROM, COVER_TO, [100, 0]);
  const coverY = useMotionTemplate`${coverPct}%`;
  const grid = "grid grid-cols-3 gap-x-4 gap-y-6 two:grid-cols-5 three:grid-cols-9 three:gap-x-3";
  const slots = data.cells.length + 1;

  return (
    <div ref={track} className={`${styles.track} ${styles.readingTrack}`}>
      <div className={`${styles.pin} ${styles.deepField} px-4 two:px-10`}>
        <div className="mx-auto w-full max-w-[1120px] py-16 three:py-10">
          <Label>One row, twice</Label>

          <h2
            className="mt-6 max-w-[18ch]"
            style={{
              fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(28px, 4vw, 46px)",
              lineHeight: 1.1,
              letterSpacing: "-0.018em",
            }}
          >
            <TwoTone
              setup={["The row as the paper prints it."]}
              punch="The same row, with every reading resolved."
            />
          </h2>

          <div
            className="mt-12 grid overflow-hidden three:mt-10"
            style={{ borderRadius: "var(--radius-site-panel)" }}
          >
            {/* As written. Paper: warm, light, typeset. */}
            <div
              className="col-start-1 row-start-1"
              style={{
                ["--ink" as string]: "var(--paper-ink)",
                ["--mark" as string]: "var(--siglum-paper)",
                ["--grid" as string]: "var(--rule-grid)",
              }}
            >
              <Panel
                className="bg-[var(--paper)]"
                caption={`${data.table} · ${data.paper} · as written`}
                footer={
                  <>
                    <Rule progress={p} dormant />
                    <p className="mt-4 t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                      row {data.row} · {data.system}
                    </p>
                  </>
                }
              >
                <div className={grid}>
                  {data.cells.map((cell, i) => (
                    <WrittenCell
                      key={cell.header}
                      index={i}
                      header={cell.header}
                      value={cell.text}
                      progress={p}
                    />
                  ))}
                  <WrittenCell
                    index={data.cells.length}
                    header={data.average.header}
                    value={data.average.claimed}
                    progress={p}
                  />
                </div>
              </Panel>
            </div>

            {/* Resolved. Chrome: cool, dark, monospaced — the instrument, not
                the document. Same grid, same radius, same box. */}
            <motion.div
              className={`${styles.scrub} col-start-1 row-start-1`}
              style={{
                y: coverY,
                ["--ink" as string]: "var(--chrome-text)",
                ["--mark" as string]: "var(--siglum)",
                ["--grid" as string]: "var(--chrome-line)",
              }}
            >
              <Panel
                className="bg-[var(--chrome-panel)]"
                caption={`${data.table} · ${data.paper} · values parsed per cell`}
                footer={
                  <>
                    <Rule progress={p} />
                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                      {[
                        ["claimed", data.average.claimed],
                        ["computed", data.average.computed],
                        ["delta", data.average.delta],
                      ].map(([term, value]) => (
                        <span key={term} className="flex items-baseline gap-2">
                          <span className="t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                            {term}
                          </span>
                          <span className="t-num" style={{ color: "var(--ink)", fontSize: "13px" }}>
                            {value}
                          </span>
                        </span>
                      ))}
                      <span className="flex items-center gap-2">
                        <VerdictGlyph verdict={data.average.verdict} size={12} />
                        <span className="t-num" style={{ color: "var(--ink)", fontSize: "13px" }}>
                          {VERDICT_LABEL[data.average.verdict]}
                        </span>
                      </span>
                    </div>
                  </>
                }
              >
                <div className={grid}>
                  {data.cells.map((cell, i) => (
                    <ResolvedCell
                      key={cell.header}
                      index={i}
                      count={slots}
                      header={cell.header}
                      value={cell.text}
                      progress={p}
                      mark={
                        <span className="t-num" style={{ color: "var(--mark)", fontSize: "11px" }}>
                          {cell.count}
                        </span>
                      }
                    />
                  ))}
                  <ResolvedCell
                    index={data.cells.length}
                    count={slots}
                    header={data.average.header}
                    value={data.average.claimed}
                    progress={p}
                    mark={<VerdictGlyph verdict={data.average.verdict} size={12} />}
                  />
                </div>
              </Panel>
            </motion.div>
          </div>

          <p
            className="mt-10 max-w-[58ch] three:mt-8"
            style={{ color: "var(--chrome-dim)", fontSize: "16px", lineHeight: 1.7 }}
          >
            That row prints <span className="t-num">{data.values}</span> numbers, not{" "}
            <span className="t-num">{data.cells.length}</span>: the cell headed{" "}
            <span className="t-num">{data.cells[0]?.header}</span> holds two results. Their mean is{" "}
            <span className="t-num">{data.average.computed}</span>. The paper states{" "}
            <span className="t-num">{data.average.claimed}</span>, which is{" "}
            <span className="t-num">{data.average.delta}</span> away — just outside the rounding
            that printing one decimal place implies, so it is recorded{" "}
            {VERDICT_LABEL[data.average.verdict]} rather than as a divergence.
          </p>
        </div>
      </div>
    </div>
  );
}
