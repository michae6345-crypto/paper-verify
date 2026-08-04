import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

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
 * beside copy that makes no claim about whether anything is running. Nowhere on
 * this page does a dot stand next to a statement about whether the service is up,
 * and it must not start: a green dot beside a claim about running state is read
 * as a status light, and this product has no endpoint behind one.
 */
/**
 * Elevation, and the border that looks like a mistake.
 *
 * The capture puts its signature shadow — the 8px white ring plus the drop —
 * on a 147px-radius white pill with a 1px white border. That is this component's
 * shape exactly, so the light tag carries `--site-shadow-halo`. A tag sits over
 * the page field with content behind it, which is the case the ring exists for.
 *
 * The dark tag takes no shadow. It is a translucent pill on an inverted card,
 * and a white ring around it would read as a glow rather than as separation.
 *
 * The white border on a white fill is not an oversight and not a porting slip:
 * the capture carries `--border-color: rgb(255,255,255)` over
 * `background-color: rgb(255,255,255)` on the same element. It draws nothing.
 * It is kept because `box-sizing: border-box` still counts it, so removing it
 * takes 2px off the pill at every occurrence for no reason.
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
    // `px-3.5 py-1.5` below the breakpoint. The pill is a label, and on a 390px
    // screen the reference's 16px of horizontal padding was buying nothing and
    // spending 32px of a 342px measure — enough to push a five-word tag onto a
    // second line and turn a pill into a rounded rectangle with a halo around it.
    <span
      className="inline-flex items-center gap-2 px-3.5 py-1.5 two:gap-2.5 two:px-4 two:py-2"
      style={{
        background: dark ? "rgba(255,255,255,0.06)" : "var(--site-card)",
        border: `1px solid ${dark ? "var(--site-line-invert)" : "var(--site-card)"}`,
        borderRadius: "var(--site-radius-pill)",
        boxShadow: dark ? undefined : "var(--site-shadow-halo)",
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
        style={{ fontSize: "clamp(15px, 3.6vw, 18px)", color: dark ? "#ffffff" : "var(--site-ink)" }}
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
 *
 * **`prefetch` is a prop because a route that does not exist yet cannot be
 * prefetched.** Next prefetches an App Router `Link` the moment it enters the
 * viewport, and the request for a missing route never settles: measured here as a
 * permanently pending `GET /demo?_rsc=…`, which is a hanging request on every
 * page load and which stops `networkidle` from ever firing, so
 * `scripts/check-viewports.mjs` cannot load the page at all.
 *
 * It stays off for that control after the route lands, too. Prefetch spends a
 * document and its data on every visitor who scrolls past a button; that is worth
 * it for a route most readers will open and not for the one most of them will not.
 * Left `undefined` by default, so every existing call site keeps Next's own
 * behaviour.
 */
export function PrimaryLink({
  href,
  children,
  className,
  prefetch,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
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
 *
 * `elevation` is how far off the page it stands, and the values are the
 * elevation tokens in `globals.css`, not free-form shadows. Three levels rather
 * than a scale, because the only distinction the page needs is background,
 * foreground, and the one thing being pointed at:
 *
 *   resting   the default. A card that is part of a field of cards.
 *   card      standing off the page. For the one card in a group that leads.
 *   halo      the white ring and drop. For an element that has to read as
 *             detached from whatever it overlaps, which is what the verdict
 *             pills and the hero result are doing.
 *
 * `none` exists for a card that is already inside another elevated surface.
 * Stacking two shadows reads as fog, not as depth.
 *
 * `radius` is here because this component used to hard-code the 24px card
 * radius, which meant anything needing the 16px inner radius had to hand-roll
 * its own surface instead — which is what the four check cards were doing, and
 * why they went a whole release with no elevation at all. Two values, matching
 * the two radius tokens, because a third would be a scale nobody asked for.
 */
export function Card({
  children,
  className,
  tone = "light",
  elevation = "resting",
  radius = "card",
}: {
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
  elevation?: "none" | "resting" | "card" | "halo";
  radius?: "card" | "inner";
}) {
  const dark = tone === "dark";
  const shadow = {
    none: undefined,
    resting: "var(--site-shadow-raised)",
    card: "var(--site-shadow-card)",
    halo: "var(--site-shadow-halo)",
  }[elevation];

  return (
    <div
      className={cn("relative", className)}
      style={{
        background: dark ? "var(--site-deep)" : "var(--site-card)",
        borderRadius: radius === "inner" ? "var(--site-radius-inner)" : "var(--site-radius-card)",
        color: dark ? "#ffffff" : "var(--site-ink)",
        boxShadow: shadow,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Real output, quoted. Fragment Mono, tabular figures, never an illustration.
 *
 * `style` is passed through because the face and the tabular figures are the
 * whole of what this component asserts — a caller setting a size or a colour on
 * a quoted value is not fighting it. Refusing the prop only meant callers reached
 * for a bare `span` with `site-mono` on it, which is the same thing with the
 * guarantee dropped.
 */
export function Mono({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={cn("site-mono", className)} style={style}>
      {children}
    </span>
  );
}
