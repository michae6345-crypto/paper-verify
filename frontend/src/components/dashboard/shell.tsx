"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { appFonts } from "@/components/shell/fonts";
import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { ACCOUNT_ITEM, NAV_ITEMS } from "./nav";
import { RAIL_CLOSED, RAIL_OPEN, Rail } from "./rail";
import { ProjectSwitcher, type SwitcherPaper } from "./switcher";

/**
 * The dashboard frame: rail on the left, project header inset above the content.
 *
 * Scoped tokens, declared here and used by every file in this directory. They are
 * geometry only — no colour, no type, nothing that could drift from §3:
 *
 *   --dash-gap           8px. The inset that lets the rail read as a floating
 *                        panel with corners on all four sides rather than as a
 *                        wall welded to the window edge.
 *   --dash-radius        16px, `--radius-surface`. Panels and the rail.
 *   --dash-radius-row    12px, `--radius-control`. Rows, controls, empty states.
 *   --dash-radius-chip   8px. Between §3's 4px chip and 12px control. A 4px chip
 *                        beside a 16px panel is the hard edge the brief rules out.
 *   --dash-content-pad   how far the content clears the rail. Written by the pin
 *                        state, read by one CSS class, so pinning the rail pushes
 *                        the page instead of covering it.
 *
 * Below 760px there is no rail at all. A hover-expanding column has nothing to
 * hover on a phone, and the two usual answers are both worse than the third:
 *
 *   a drawer behind a menu button   hides five destinations behind a tap, on the
 *                                   one screen size with the least room to get lost
 *   tap-to-expand in place          a 64px column that grows over the content when
 *                                   touched, with no pointer-leave to close it
 *   what this does                  the rail unrolls into a horizontal row of
 *                                   labelled pills under the header
 *
 * The pills carry the same marks and the same words, permanently — which is the
 * state the expanded rail is trying to reach anyway. Nothing is behind a hover,
 * nothing is behind a tap, every target is at least 44px, and the row scrolls
 * sideways if the words do not fit.
 */

const PILL_ITEMS = [...NAV_ITEMS, ACCOUNT_ITEM];

function PhoneNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="flex gap-1.5 overflow-x-auto px-4 pb-3 two:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {PILL_ITEMS.map((item) => {
        const here = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={here ? "page" : undefined}
            className="t-body flex min-h-11 shrink-0 items-center border px-3.5"
            style={{
              borderRadius: "var(--dash-radius-row)",
              borderColor: here ? "transparent" : "var(--chrome-line)",
              background: here ? "var(--chrome-raised)" : "transparent",
              color: here ? "var(--chrome-text)" : "var(--chrome-dim)",
              fontWeight: here ? 500 : 400,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  papers,
  children,
}: {
  papers: SwitcherPaper[];
  children: ReactNode;
}) {
  // `useReducedMotionGate`, never `useReducedMotion` from motion/react: this
  // component renders a different tree under the preference (the rail is open and
  // the pin control is gone), which is exactly the case the gate exists for.
  const reduced = useReducedMotionGate();
  const [pinned, setPinned] = useState(false);
  const persistent = pinned || reduced;

  return (
    <div
      className={appFonts}
      style={
        {
          "--dash-gap": "8px",
          "--dash-radius": "16px",
          "--dash-radius-row": "12px",
          "--dash-radius-chip": "8px",
          "--dash-content-pad": `calc(${persistent ? RAIL_OPEN : RAIL_CLOSED}px + var(--dash-gap) * 2)`,
          // The page is `--field-deep` and every panel on it is `--chrome-base`.
          // See the note in `surface.tsx`: verdict marks need the deeper field to
          // clear 3:1, so the panels take it and the page goes one step below.
          background: "var(--field-deep)",
          color: "var(--chrome-text)",
        } as React.CSSProperties
      }
    >
      <Rail pinned={pinned} onPinnedChange={setPinned} reduced={reduced} />

      <div
        className="min-h-dvh transition-[padding-inline-start] ease-out two:ps-(--dash-content-pad)"
        style={{ transitionDuration: "var(--dur-panel)" }}
      >
        {/* `motion-safe:` rather than plain `sticky`, and it is not a style
            preference. A sticky header is a scroll-driven effect: the element
            moves relative to the document as the reader scrolls. Under
            prefers-reduced-motion it stops being sticky and simply scrolls away,
            which is what `scripts/check-reduced-motion.mjs` asserts for every
            surface in this product — no pin survives the preference. The class
            is CSS, so it is right whether or not the JavaScript arrives. */}
        <header
          className="z-20 pt-3 motion-safe:sticky motion-safe:top-0 two:pt-4"
          style={{
            background: "var(--field-deep)",
            borderBottom: "1px solid var(--rule-grid-deep)",
          }}
        >
          <div className="flex min-w-0 items-center justify-between gap-3 px-4 pb-3 two:px-6">
            <ProjectSwitcher papers={papers} />

            {/* What this screen is reading, said once, permanently. The dashboard
                is wired to the committed fixtures because there is no API for it
                yet, and a private screen is still a screen someone reads a number
                off. */}
            <span
              className="hidden shrink-0 items-center gap-2 border px-2.5 py-1 two:inline-flex"
              title="Every figure on this dashboard is read from the run reports committed under src/fixtures/reports."
              style={{
                borderColor: "var(--chrome-line)",
                borderRadius: "var(--dash-radius-chip)",
                color: "var(--chrome-dim)",
                fontSize: "11px",
              }}
            >
              reading committed fixtures
            </span>
          </div>

          <PhoneNav />
        </header>

        <main className="px-4 pt-5 pb-16 two:px-6 two:pt-6">{children}</main>
      </div>
    </div>
  );
}
