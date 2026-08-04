import Link from "next/link";
import type { ReactNode } from "react";

import type { Verdict } from "@/types/run-report";
import { VERDICT_LABEL } from "@/lib/verdict";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { cn } from "@/lib/utils";

/**
 * The dashboard's surfaces: panel, section head, row, stat, chip, empty state.
 *
 * Server components, no client boundary. Everything is drawn from the §3 tokens
 * already in `globals.css`; the only values this directory introduces are the
 * three scoped in `shell.tsx`, and they are geometry, not colour.
 *
 * Two rules carried through every part below, both from CLAUDE.md:
 *
 *   Verdict colour never appears on chrome — not on a chip, not on a button, not
 *   on a heading. It appears on a verdict glyph and nowhere else, and the glyph
 *   is always accompanied by the verdict's word, so colour is never the only
 *   signal.
 *
 *   Nothing here is a card with a box around it. Vercel's density comes from
 *   hairlines and type hierarchy, not from nested borders, and a dashboard of
 *   boxes inside boxes is unreadable at the row heights this needs.
 */

/* -------------------------------------------------------------------------- */
/* Panels                                                                      */
/* -------------------------------------------------------------------------- */

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn("border", padded && "p-4 two:p-5", className)}
      style={{
        // `--chrome-base`, not `--chrome-panel`, and this is a contrast decision
        // rather than a taste one. `--v-pending` is a mandated verdict colour and
        // it clears 3:1 only on a field this deep (3.06 on #141414, 1.9 on
        // #262626). Every panel here carries verdict marks, so every panel is
        // #141414 and the page behind them is `--field-deep`.
        background: "var(--chrome-base)",
        borderColor: "var(--chrome-line)",
        borderRadius: "var(--dash-radius)",
      }}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="t-panel-title" style={{ color: "var(--chrome-text)" }}>
          {title}
        </h2>
        {note ? (
          <p className="t-body mt-1 max-w-[68ch]" style={{ color: "var(--chrome-dim)" }}>
            {note}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** A page heading. Display face, the landing's tracking, sentence case. */
export function ScreenHead({
  title,
  lede,
  aside,
}: {
  title: string;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1
          style={{
            fontSize: "clamp(22px, 2.4vw, 28px)",
            lineHeight: 1.2,
            letterSpacing: "-0.03em",
            fontWeight: 500,
            color: "var(--chrome-text)",
          }}
        >
          {title}
        </h1>
        {lede ? (
          <p className="t-body mt-2 max-w-[74ch]" style={{ color: "var(--chrome-dim)" }}>
            {lede}
          </p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A list of rows separated by hairlines rather than boxed. `href` turns the whole
 * row into one target — a row with three separate links in it is three places to
 * miss on a phone.
 */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col", className)}>{children}</ul>;
}

export function RowLink({
  href,
  children,
  first = false,
}: {
  href: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <li
      style={{
        borderTop: first ? "none" : "1px solid var(--chrome-line)",
      }}
    >
      <Link
        href={href}
        className="block px-3 py-3 transition-colors hover:bg-[var(--chrome-panel)] two:px-4"
        style={{
          borderRadius: "var(--dash-radius-row)",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        {children}
      </Link>
    </li>
  );
}

export function RowStatic({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <li
      className="px-3 py-3 two:px-4"
      style={{ borderTop: first ? "none" : "1px solid var(--chrome-line)" }}
    >
      {children}
    </li>
  );
}

/** A column heading strip above a row list. Hidden below `two:` where rows stack. */
export function ColumnHeads({ children }: { children: ReactNode }) {
  return (
    <div
      className="t-label hidden px-4 pb-2 two:block"
      style={{ borderBottom: "1px solid var(--rule-grid-deep)" }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small parts                                                                 */
/* -------------------------------------------------------------------------- */

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("t-num", className)} style={{ color: "var(--chrome-faint)" }}>
      {children}
    </span>
  );
}

/**
 * A neutral chip. Never carries a verdict colour: chips are chrome, and §3 keeps
 * verdict colour off chrome entirely.
 */
export function Chip({
  children,
  tone = "quiet",
}: {
  children: ReactNode;
  tone?: "quiet" | "raised";
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5"
      style={{
        borderRadius: "var(--dash-radius-chip)",
        border: "1px solid var(--chrome-line)",
        background: tone === "raised" ? "var(--chrome-raised)" : "transparent",
        color: tone === "raised" ? "var(--chrome-text)" : "var(--chrome-dim)",
        fontSize: "11px",
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/**
 * One figure. `value` is always `t-num`, which carries `tabular-nums` with it, so
 * a numeric cannot be written here without it.
 */
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="t-label">{label}</p>
      <p
        className="t-num mt-1.5"
        style={{ fontSize: "24px", lineHeight: 1.1, color: "var(--chrome-text)" }}
      >
        {value}
      </p>
      {note ? (
        <p className="t-body mt-1" style={{ color: "var(--chrome-faint)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Glyph, count, word. The count is never a percentage and never a score (§5.5). */
export function VerdictCount({
  verdict,
  count,
  size = 12,
}: {
  verdict: Verdict;
  count: number;
  size?: number;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="translate-y-[2px]">
        <VerdictGlyph verdict={verdict} size={size} />
      </span>
      <span className="t-num" style={{ color: "var(--chrome-text)" }}>
        {count}
      </span>
      <span style={{ color: "var(--chrome-dim)", fontSize: "12px" }}>{VERDICT_LABEL[verdict]}</span>
    </span>
  );
}

/**
 * The honest empty state, and the reason this component exists at all.
 *
 * A panel with no data says three things and never fewer: that it is empty, what
 * would fill it, and what has to exist first. `docs/DASHBOARD.md` lists the
 * endpoints that would supply each one; those go in `needs`.
 */
export function Empty({
  title,
  body,
  needs,
}: {
  title: string;
  body: ReactNode;
  needs?: ReactNode[];
}) {
  return (
    <div
      className="px-4 py-6"
      style={{
        border: "1px dashed var(--chrome-line)",
        borderRadius: "var(--dash-radius-row)",
        background: "var(--field-deep)",
      }}
    >
      <p className="t-emph" style={{ color: "var(--chrome-text)" }}>
        {title}
      </p>
      <p className="t-body mt-1.5 max-w-[70ch]" style={{ color: "var(--chrome-dim)" }}>
        {body}
      </p>
      {needs?.length ? (
        <>
          <p className="t-label mt-4">What would fill it</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {needs.map((need, i) => (
              <li
                key={i}
                className="t-body flex gap-2"
                style={{ color: "var(--chrome-dim)" }}
              >
                <span aria-hidden style={{ color: "var(--chrome-faint)" }}>
                  &middot;
                </span>
                <span className="min-w-0">{need}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** A definition pair, used down the right of a detail screen. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="t-label">{label}</dt>
      <dd className="t-body mt-1" style={{ color: "var(--chrome-text)" }}>
        {children}
      </dd>
    </div>
  );
}
