import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * The marketing route group (ARCHITECTURE §16). It sits beside the app and
 * deliberately does not mount the `NavRail` shell. The app chrome is for people
 * inside a run, and nobody on a landing page is inside a run yet.
 *
 * Not a root layout: `app/layout.tsx` still owns <html>, the fonts and the
 * tooltip provider, so navigating between the site and the app is a client
 * transition rather than a full reload.
 */

export const metadata: Metadata = {
  // Lowercase in the title bar too. A residual is the difference between an
  // observed value and a predicted one, which is what this computes.
  title: "residual — check whether a paper's own numbers agree",
  description:
    "residual reads an arXiv paper's LaTeX source, recomputes what can be recomputed, and reports where the numbers match, where they diverge, and where it cannot tell.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col" style={{ background: "var(--chrome-base)" }}>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
