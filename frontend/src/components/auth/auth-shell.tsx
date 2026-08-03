import Link from "next/link";
import { Fragment_Mono, Instrument_Serif, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { AuthNav } from "@/components/auth/auth-nav";
import { NoAuthNotice } from "@/components/auth/no-auth-notice";

/**
 * The chrome for `/login`, `/submit` and `/account`.
 *
 * These sit outside the `(site)` route group, so they do not inherit its layout
 * and have to establish the same two things for themselves: the `data-site`
 * attribute that switches `globals.css` over to the light token set, and the
 * three faces those tokens name. Both are set on this element, so both stop at
 * the edge of this subtree and `/runs` stays as dark as it was.
 *
 * The site's own header is not reused. It is a landing-page menu — seven
 * in-page anchors that do not exist here — and it is fixed, condenses on scroll,
 * and locks the body. A form page wants a bar that stays where it is put.
 */

const instrumentSerif = Instrument_Serif({
  variable: "--font-site-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-site-body",
  subsets: ["latin"],
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  variable: "--font-site-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-site=""
      className={`${instrumentSerif.variable} ${inter.variable} ${fragmentMono.variable} flex min-h-dvh flex-col`}
      // The app's focus ring is #6a7bff, picked against the dark chrome. On the
      // #d9d9d9 field it lands at 2.6:1, under the 3:1 a focus indicator needs.
      // Overriding the variable here rather than in globals.css keeps the change
      // inside this subtree, where the page is light.
      style={{ "--focus": "#000000" } as React.CSSProperties}
    >
      <header
        style={{ borderBottom: "1px solid var(--site-line)", background: "var(--site-base)" }}
      >
        <div
          className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 py-4"
          style={{ paddingInline: "var(--site-gutter)" }}
        >
          <Link
            href="/"
            className="flex h-11 items-center px-6"
            style={{
              background: "var(--site-card)",
              borderRadius: "var(--site-radius-pill)",
              color: "var(--site-ink)",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            residual
          </Link>

          <AuthNav />
        </div>
      </header>

      <NoAuthNotice />

      <main className="flex-1 pb-24">{children}</main>

      <footer style={{ borderTop: "1px solid var(--site-line)" }}>
        <div
          className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 py-8 two:flex-row two:items-center two:justify-between"
          style={{ paddingInline: "var(--site-gutter)" }}
        >
          <p style={{ fontSize: "14px", color: "var(--site-muted)" }}>&copy; residual, 2026</p>
          <nav aria-label="Elsewhere" className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              { href: "/", label: "What residual does" },
              { href: "/check", label: "Check a paper" },
              { href: "/reports", label: "Reports" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="underline underline-offset-4"
                style={{ fontSize: "14px", color: "var(--site-muted)" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * The page heading block every one of these screens opens with: an eyebrow set
 * in Instrument Serif italic, the title, and one line of lede.
 */
export function PageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
}) {
  return (
    <div className="mb-8 two:mb-12">
      {/* Not the accent: #ff3700 is 3.65:1 on a white card, which is fine for a
          glyph and short of the 4.5:1 this is. The accent earns its place on the
          no-auth notice, where it is a background. */}
      <p className="site-display" style={{ fontSize: "20px", color: "var(--site-muted)" }}>
        {eyebrow}
      </p>
      <h1
        className="mt-2"
        style={{
          fontSize: "clamp(34px, 5vw, 56px)",
          fontWeight: 400,
          letterSpacing: "-0.04em",
          lineHeight: 1.1,
          color: "var(--site-ink)",
        }}
      >
        {title}
      </h1>
      <p className="site-lede mt-4 max-w-[62ch]">{lede}</p>
    </div>
  );
}

/** The measure these pages are set on. Narrower than the landing page's 1440. */
export function Measure({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto w-full max-w-[860px] pt-10 two:pt-16"
      style={{ paddingInline: "var(--site-gutter)" }}
    >
      {children}
    </div>
  );
}
