import type { Metadata } from "next";
import { Fragment_Mono, Instrument_Serif, Inter } from "next/font/google";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * The marketing route group (ARCHITECTURE §16). It sits beside the app and
 * deliberately does not mount the `NavRail` shell. The app chrome is for people
 * inside a run, and nobody on a landing page is inside a run yet.
 *
 * Not a root layout: `app/layout.tsx` still owns <html>, the application fonts
 * and the tooltip provider, so navigating between the site and the app is a
 * client transition rather than a full reload.
 *
 * Three faces load here rather than in the root layout, because they are only
 * ever used on this route group. `next/font` puts each behind a CSS variable,
 * and a variable set on this element cascades to everything under it and to
 * nothing above it — which is also exactly how `data-site` works. `/reports` and
 * `/runs` sit outside this subtree, so they see neither the faces nor the
 * tokens, and the dark chrome is untouched.
 */

// Display. Section tags are set in this, italic, at 24px. Not a variable font:
// one weight, two styles, both of which the page uses.
const instrumentSerif = Instrument_Serif({
  variable: "--font-site-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

// Body, and the headings with it. The reference sets its headings in Inter
// Display, which Google does not publish; Inter is the same design, and at
// -0.06em tracking the difference is a few terminals. Variable, so no weights.
const inter = Inter({
  variable: "--font-site-body",
  subsets: ["latin"],
  display: "swap",
});

// Mono. Numbers, reason codes and paths into the repository, and nothing else.
const fragmentMono = Fragment_Mono({
  variable: "--font-site-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  // Lowercase in the title bar too. A residual is the difference between an
  // observed value and a predicted one, which is what this computes.
  title: "residual — check whether a paper's own numbers agree",
  description:
    "residual reads an arXiv paper's LaTeX source, recomputes what can be recomputed, and reports where the numbers match, where they diverge, and where it cannot tell.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-site=""
      className={`${instrumentSerif.variable} ${inter.variable} ${fragmentMono.variable} flex min-h-dvh flex-col`}
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
