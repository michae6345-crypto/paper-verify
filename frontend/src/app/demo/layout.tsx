import Link from "next/link";
import { Fragment_Mono, Instrument_Serif, Inter } from "next/font/google";
import type { ReactNode } from "react";

/**
 * The chrome for `/demo`.
 *
 * It sits outside the `(site)` route group, so like `AuthShell` it has to
 * establish the same two things for itself: the `data-site` attribute that
 * switches `globals.css` over to the light token set, and the three faces those
 * tokens name. Both are set on this element, so both stop at the edge of this
 * subtree and `/runs` stays as dark as it was.
 *
 * The landing page's `SiteHeader` is deliberately not reused, for the reason
 * `AuthShell` gives about the same decision: it is a menu of nine in-page
 * anchors that do not exist here, it is fixed, it condenses on scroll and it
 * locks the body. A page whose whole job is one form wants a bar that stays
 * where it is put and a way back to the page the reader came from.
 *
 * `SiteFooter` is not reused either, and that one is not about mechanics. It is
 * the landing page's closing call to action, and closing a form page with a
 * second call to action is asking somebody to leave the form they are filling.
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

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-site=""
      className={`${instrumentSerif.variable} ${inter.variable} ${fragmentMono.variable} flex min-h-dvh flex-col`}
      // The app's focus ring is #6a7bff, picked against the dark chrome. On the
      // #d9d9d9 field it lands at 2.6:1, under the 3:1 a focus indicator needs.
      // Overriding the variable here keeps the change inside this subtree.
      style={{ "--focus": "#000000" } as React.CSSProperties}
    >
      <header style={{ borderBottom: "1px solid var(--site-line)", background: "var(--site-base)" }}>
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

          <Link
            href="/#intro"
            className="flex h-11 items-center px-5"
            style={{ color: "var(--site-ink)", fontSize: "15px", fontWeight: 500 }}
          >
            What it does
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer style={{ borderTop: "1px solid var(--site-line)" }}>
        <div
          className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 py-8 two:flex-row two:items-center two:justify-between"
          style={{ paddingInline: "var(--site-gutter)" }}
        >
          <p style={{ fontSize: "14px", color: "var(--site-muted)" }}>&copy; residual, 2026</p>
          <p className="max-w-[54ch]" style={{ fontSize: "14px", color: "var(--site-muted)" }}>
            In development. This form records a request in your browser and sends nothing.
          </p>
        </div>
      </footer>
    </div>
  );
}
