import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The site's vertical rhythm: every section is a full-bleed band separated from
 * the next by a 1px `--chrome-line` rule, with the same left-aligned label →
 * heading → lede opening. Elevation is borders, never shadow (§3).
 *
 * Marketing type runs larger than the §3 application scale, which tops out at
 * 15px for a panel title. The faces, weights, colours and `tabular-nums` are the
 * design system unchanged; only the display sizes are new, and they exist only
 * on this route group.
 */

export function Section({
  id,
  label,
  heading,
  lede,
  children,
  className,
}: {
  id?: string;
  label?: string;
  heading?: string;
  lede?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("border-b px-5 py-14 two:px-8 two:py-20", className)}
      style={{ borderColor: "var(--chrome-line)" }}
    >
      <div className="mx-auto w-full max-w-[1080px]">
        {(label || heading || lede) && (
          <header className="max-w-[62ch]">
            {label && <p className="t-label">{label}</p>}
            {heading && (
              <h2
                className="mt-3 font-medium tracking-[-0.01em]"
                style={{ color: "var(--chrome-text)", fontSize: "clamp(22px, 3.2vw, 30px)", lineHeight: 1.2 }}
              >
                {heading}
              </h2>
            )}
            {lede && (
              <div
                className="mt-3"
                style={{ color: "var(--chrome-dim)", fontSize: "15px", lineHeight: 1.6 }}
              >
                {lede}
              </div>
            )}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}

/** A bordered panel. The only container on the site. */
export function Panel({
  children,
  className,
  raised = false,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
}) {
  return (
    <div
      className={cn("border", className)}
      style={{
        borderColor: "var(--chrome-line)",
        background: raised ? "var(--chrome-raised)" : "var(--chrome-panel)",
        borderRadius: "var(--radius-panel)",
      }}
    >
      {children}
    </div>
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
      style={{ color: "var(--chrome-dim)", fontSize: "12px", lineHeight: 1.6 }}
    >
      {children}
    </pre>
  );
}
