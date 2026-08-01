import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The four shapes every section on the landing page is built out of.
 *
 * The reference redraws each of these per section with its own generated class
 * name, which is how a design tool works and not how a codebase should. They are
 * one component each here, so a change to the tag rule or the pill radius is one
 * edit rather than fifteen.
 */

/**
 * The measure. 1440px of content inside a gutter that steps 24 → 48 → 120 at the
 * reference's own breakpoints; the gutter is a token, so the step lives in CSS.
 */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1440px]", className)}
      style={{ paddingInline: "var(--site-gutter)" }}
    >
      {children}
    </div>
  );
}

/**
 * The section tag: a hairline pill, a small dot, and two or three words in
 * Instrument Serif italic. It names the section and says nothing else.
 *
 * The dot is the reference's, and it is decoration rather than status — it sits
 * beside copy that makes no claim about whether anything is running. The one
 * place this repository refuses a green dot is the footer's status line, which
 * does make such a claim; that line is still plain text.
 */
export function Tag({
  children,
  tone = "light",
  dot,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  dot?: boolean;
}) {
  const dark = tone === "dark";
  return (
    <span
      className="inline-flex items-center gap-2.5 px-4 py-2"
      style={{
        background: dark ? "rgba(255,255,255,0.06)" : "var(--site-card)",
        border: `1px solid ${dark ? "var(--site-line-invert)" : "var(--site-card)"}`,
        borderRadius: "var(--site-radius-pill)",
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "#0cb300" }}
        />
      )}
      <span
        className="site-display"
        style={{ fontSize: "18px", color: dark ? "#ffffff" : "var(--site-ink)" }}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * The primary control. Black pill, white label, and the reference's six-stop
 * shadow with an inset at the foot of it — the one shadow the whole product
 * allows itself, and the reason `.site-lift` exists in `globals.css`.
 */
export function PrimaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "site-lift inline-flex items-center justify-center gap-2 px-7 py-3.5 transition-transform",
        className,
      )}
      style={{
        background: "var(--site-ink)",
        color: "#ffffff",
        borderRadius: "var(--site-radius-pill)",
        fontSize: "16px",
        fontWeight: 600,
        lineHeight: 1.2,
        transitionDuration: "var(--dur-panel)",
      }}
    >
      {children}
    </Link>
  );
}

/** The quiet second control beside it. No fill, no shadow, same height. */
export function GhostLink({
  href,
  children,
  tone = "light",
}: {
  href: string;
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 transition-colors"
      style={{
        color: dark ? "#ffffff" : "var(--site-ink)",
        borderRadius: "var(--site-radius-pill)",
        fontSize: "16px",
        fontWeight: 500,
        lineHeight: 1.2,
        transitionDuration: "var(--dur-fast)",
      }}
    >
      {children}
    </Link>
  );
}

/**
 * A white card on the page field. Every section that carries entries carries
 * them in one of these.
 */
export function Card({
  children,
  className,
  tone = "light",
}: {
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn("relative", className)}
      style={{
        background: dark ? "var(--site-deep)" : "var(--site-card)",
        borderRadius: "var(--site-radius-card)",
        color: dark ? "#ffffff" : "var(--site-ink)",
      }}
    >
      {children}
    </div>
  );
}

/** Real output, quoted. Fragment Mono, tabular figures, never an illustration. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("site-mono", className)}>{children}</span>;
}
