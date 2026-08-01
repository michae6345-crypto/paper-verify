"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * §4: 56px, icon-only, tooltip on hover.
 *
 * Icons are drawn here rather than pulled from an icon library so the rail keeps
 * the same drawn, instrument-like line weight as the verdict marks. Verdict
 * colours never appear here (§3) — the rail is chrome, not semantics.
 */

function CheckPaperIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4.5 2.5h8l3.5 3.5v11.5h-11.5z" strokeLinejoin="round" />
      <path d="M12.5 2.5v3.5h3.5" strokeLinejoin="round" />
      <path d="M7 10h6M7 13h4" strokeLinecap="round" />
    </svg>
  );
}

function RunsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
      <circle cx="6.5" cy="5" r="1.6" fill="var(--chrome-base)" />
      <circle cx="12" cy="10" r="1.6" fill="var(--chrome-base)" />
      <circle cx="8.5" cy="15" r="1.6" fill="var(--chrome-base)" />
    </svg>
  );
}

const ITEMS = [
  { href: "/", label: "Check a paper", icon: CheckPaperIcon, match: (p: string) => p === "/" },
  {
    href: "/#recent",
    label: "Recently checked",
    icon: RunsIcon,
    match: (p: string) => p.startsWith("/runs"),
  },
];

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r py-3"
      // `--rule-grid-deep` is the construction grid: the hairlines that divide
      // the layout into columns. Row separators inside a column keep
      // `--chrome-line`, so the structure of the page and the structure of a
      // list are told apart by two inks rather than by one doing both jobs.
      style={{ borderColor: "var(--rule-grid-deep)", background: "var(--chrome-panel)" }}
    >
      {/* Wordmark. Never carries a verdict colour (§3). */}
      <Link
        href="/"
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-[4px] t-num"
        style={{ color: "var(--chrome-text)", fontSize: "13px", fontWeight: 500 }}
        aria-label="residual, home"
      >
        pv
      </Link>

      {ITEMS.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger
              render={
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-[4px] transition-colors",
                  )}
                  style={{
                    color: active ? "var(--chrome-text)" : "var(--chrome-faint)",
                    background: active ? "var(--chrome-raised)" : "transparent",
                    transitionDuration: "var(--dur-fast)",
                  }}
                />
              }
            >
              <Icon />
              <span className="sr-only">{item.label}</span>
            </TooltipTrigger>
            {/* The rail's own box is a static flex child at `z-index: auto`, so
                the report's `z-20` bottom sheet already paints over it. Its
                TOOLTIP does not: `TooltipContent` portals into `<body>` at
                `z-50`, which outranks the sheet from outside the rail's subtree
                entirely — no z-index on this <nav> can reach it. That is the
                floating panel sitting above the sheet at 390px.

                So it is suppressed below `three:`, which is exactly the range
                where the sheet exists. Nothing is lost there: a tooltip is a
                pointer-only affordance, there is no hover on a phone, and each
                item already carries its label in `sr-only` text — which is what
                a screen reader reads in either case. The media query works from
                inside the portal because it is a media query, not an
                ancestor-dependent style. */}
            <TooltipContent side="right" className="hidden three:flex">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
