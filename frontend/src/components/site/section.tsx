import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./field.module.css";

/**
 * The site's primitives: a full-bleed colour field with the margin apparatus
 * running down it, and the opener every section starts with.
 *
 * DESIGN_PLAN.md, "Layout": sections alternate `--field-paper` and
 * `--field-deep`, and one hairline grid plus one line-number column cross all of
 * them unchanged, so the page reads as one document that changes colour.
 *
 * Marketing type runs larger than the §3 application scale, which tops out at
 * 15px for a panel title. The faces, weights, colours and `tabular-nums` are the
 * design system unchanged; only the display sizes are new, and they exist only
 * on this route group. Hierarchy comes from size and from the serif-to-sans
 * switch. Bold is used almost nowhere.
 */

export type Tone = "paper" | "deep";

/**
 * How many numbers the margin generates. They are clipped by the field, so this
 * only has to be at least as many as the tallest the section can get; a count
 * that is too small would leave the margin stopping short of the text, which is
 * the one thing that would read as broken.
 */
const MARGIN_LINES = 320;

function Margin() {
  return (
    // The margin is an apparatus, not content: every siglum it carries is also
    // printed inline on the entry it belongs to, so nothing is lost by hiding
    // the numbers from assistive technology.
    <div className={styles.margin} aria-hidden="true">
      <div className={styles.lines}>
        {Array.from({ length: MARGIN_LINES }, (_, i) => (
          <span key={i} className={styles.line}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A full-bleed field with the margin down its left edge. */
export function Field({
  id,
  tone,
  children,
  className,
}: {
  id?: string;
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(styles.field, tone === "paper" ? styles.paper : styles.deep, className)}
    >
      <div className={styles.inner}>
        <Margin />
        <div className={styles.body}>{children}</div>
      </div>
    </section>
  );
}

/**
 * The single accent gesture: `--wash` behind exactly one phrase. Never two on a
 * screen — the highlight works precisely because it appears once.
 */
export function Wash({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        background: "var(--accent)",
        color: "var(--accent-ink)",
        padding: "0.04em 0.07em",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      {children}
    </span>
  );
}

/**
 * A two-tone heading: setup lines in the dim ink, punchline at full contrast,
 * same face, same size, same weight. The only variable is colour.
 *
 * Static on purpose. A per-line reveal would say the same thing more slowly and
 * would say nothing at all in a screenshot, and the contrast is already doing
 * the work. It is also the cheapest device on the page and the strongest.
 */
export function TwoTone({ setup, punch }: { setup: ReactNode[]; punch: ReactNode }) {
  return (
    <>
      {setup.map((line, i) => (
        <span key={i} className="block" style={{ color: "var(--ink-dim)" }}>
          {line}
        </span>
      ))}
      <span className="block" style={{ color: "var(--ink)" }}>
        {punch}
      </span>
    </>
  );
}

/**
 * The label above the heading. Headings never sit alone: the label names the
 * section, and the short rule marks it on the grid. The mark is a rule rather
 * than a square on purpose — a small filled square beside a mono label is the
 * reference's lockup, and the structural job is done here by the margin.
 */
export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="inline-block h-px w-3 shrink-0"
        style={{ background: "var(--mark)" }}
      />
      <span
        className="t-num"
        style={{
          color: "var(--mark)",
          fontSize: "11px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
    </p>
  );
}

/** Label, then heading, then at most one sentence. In that order, every time. */
export function Opener({
  label,
  heading,
  lede,
  level = 2,
}: {
  label: string;
  heading: ReactNode;
  lede?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    // The heading runs to about fourteen words a line at most, and the sentence
    // under it sits in a column narrower still. Most of the field stays open.
    <header>
      <Label>{label}</Label>
      <Heading
        className="mt-8 max-w-[16ch] three:max-w-[20ch]"
        style={{
          fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
          fontWeight: 400,
          color: "var(--ink)",
          fontSize:
            level === 1 ? "clamp(36px, 6vw, 68px)" : "clamp(30px, 4.4vw, 52px)",
          lineHeight: level === 1 ? 1.05 : 1.1,
          letterSpacing: "-0.018em",
        }}
      >
        {heading}
      </Heading>
      {lede && (
        <div
          className="mt-10 max-w-[52ch] min-w-0"
          style={{ color: "var(--ink-dim)", fontSize: "17px", lineHeight: 1.7 }}
        >
          {lede}
        </div>
      )}
    </header>
  );
}

/** A field with the standard opener above its content. */
export function Section({
  id,
  tone,
  label,
  heading,
  lede,
  children,
}: {
  id?: string;
  tone: Tone;
  label: string;
  heading: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Field id={id} tone={tone}>
      <Opener label={label} heading={heading} lede={lede} />
      {children}
    </Field>
  );
}

/**
 * A siglum: the mark that identifies one witness. The same character stands for
 * the same check in the margin, on the entry, and in the report.
 */
export function Siglum({ mark }: { mark: string }) {
  return (
    <span
      className="t-num inline-flex h-7 w-7 shrink-0 items-center justify-center"
      style={{
        border: "1px solid var(--grid)",
        borderRadius: "var(--radius-site-chip)",
        color: "var(--mark)",
        fontSize: "12px",
        lineHeight: 1,
      }}
    >
      {mark}
    </span>
  );
}

/**
 * Real checker output, set in IBM Plex Mono with `tabular-nums`. Every use of
 * this on the site is quoting the corpus verbatim, never an illustration of what
 * output might look like.
 */
export function Output({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre
      className={cn("overflow-x-auto whitespace-pre t-num", className)}
      style={{ color: "var(--ink-dim)", fontSize: "12px", lineHeight: 1.7 }}
    >
      {children}
    </pre>
  );
}
