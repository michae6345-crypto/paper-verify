"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { Container } from "@/components/site/ui";

/**
 * The site's own header. The app's 56px `NavRail` does not appear on the
 * marketing route group, which is the whole reason the route group exists.
 *
 * The reference puts two things in an 80px bar — the wordmark and a menu
 * button — and builds the menu's contents at runtime, so the capture contains
 * an empty <div id="overlay">. There is nothing to port there. What is here
 * instead is the page's own section anchors and the primary control, which is
 * what a menu on this page can usefully contain.
 *
 * `residual` is lowercase everywhere, including here and at the start of a
 * sentence. The capture renders it `Residual`; that is a template's title-case
 * habit and not our name.
 *
 * It is the page's one persistent element, so it is the one element that has to
 * work over every surface below it. The reference condenses its bar as the
 * reader leaves the hero and brings up a background under it; that is what the
 * scroll mapping here does. 80px of bar becomes 64 over the first 140px of
 * scroll, and the page colour comes up under it across the same 140px, taking
 * its hairline with it. Both are scrubbed off `scrollY`, so scrolling back up
 * expands it again rather than replaying anything.
 *
 * Why the bar is fixed rather than absolute: a header that condenses on the way
 * down is describing scroll depth, and one that has already scrolled off the top
 * of the document is describing nothing. It sits out of flow either way, so no
 * content moves. `scroll-mt-20` on every section already assumed a bar of this
 * height standing over the anchor targets.
 */

const SECTIONS = [
  { href: "#intro", label: "What it does" },
  { href: "#process", label: "How a run proceeds" },
  { href: "#checks", label: "The checks" },
  { href: "#decides", label: "How it decides" },
  { href: "#measured", label: "Measured" },
  { href: "#report", label: "The report" },
  { href: "#faq", label: "Questions" },
  { href: "#roadmap", label: "What's next" },
];

/** Bar heights, and the scroll distance the change is spread over. */
const TALL = 80;
const SHORT = 64;
const TRAVEL = 140;

/**
 * The bar, given its height and the opacity of the wash behind it. Both arrive
 * either as a MotionValue driven by scroll or as a plain number, which is how
 * the reduced-motion path renders resolved without a scroll subscription
 * existing anywhere in the tree.
 */
function Bar({
  height,
  wash,
  children,
}: {
  height: MotionValue<number> | number;
  wash: MotionValue<number> | number;
  children: ReactNode;
}) {
  return (
    <>
      <motion.span
        aria-hidden="true"
        className="pointer-events-auto absolute inset-x-0 top-0"
        style={{
          height,
          opacity: wash,
          background: "var(--site-base)",
          borderBottom: "1px solid var(--site-line)",
        }}
      />
      <Container>
        <motion.div
          className="pointer-events-auto relative flex items-center justify-between"
          style={{ height }}
        >
          {children}
        </motion.div>
      </Container>
    </>
  );
}

/** The same bar with scroll driving it. Only mounted when motion is allowed. */
function ScrubbedBar({ open, children }: { open: boolean; children: ReactNode }) {
  // No target: this is page scroll in pixels, which is what a header responds
  // to. Page *progress* would make the change depend on how long the page is.
  const { scrollY } = useScroll();
  const height = useTransform(scrollY, [0, TRAVEL], [TALL, SHORT], { clamp: true });
  const wash = useTransform(scrollY, [0, TRAVEL], [0, 1], { clamp: true });

  // While the menu is up the bar holds at full height: the panel starts at 80px
  // down, and a condensed bar would leave a 16px band of the page showing
  // between the two. Scroll is locked while it is open, so nothing is lost.
  return (
    <Bar height={open ? TALL : height} wash={open ? 1 : wash}>
      {children}
    </Bar>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  // A menu left open behind an anchor jump is a menu covering the thing the
  // user asked for. Escape closes it, and the page behind it is locked while
  // it is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const contents = (
    <>
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

      <div className="flex items-center gap-2">
        <Link
          href="/check"
          className="hidden h-11 items-center px-6 transition-colors two:flex"
          style={{
            background: "var(--site-ink)",
            borderRadius: "var(--site-radius-pill)",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            transitionDuration: "var(--dur-fast)",
          }}
        >
          Check a paper
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="flex h-11 w-11 flex-col items-center justify-center gap-[5px]"
          style={{
            background: "var(--site-card)",
            borderRadius: "var(--site-radius-pill)",
          }}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span
            aria-hidden="true"
            className="block h-px w-4 transition-transform"
            style={{
              background: "var(--site-ink)",
              transitionDuration: "var(--dur-panel)",
              transform: open ? "translateY(3px) rotate(45deg)" : "none",
            }}
          />
          <span
            aria-hidden="true"
            className="block h-px w-4 transition-transform"
            style={{
              background: "var(--site-ink)",
              transitionDuration: "var(--dur-panel)",
              transform: open ? "translateY(-3px) rotate(-45deg)" : "none",
            }}
          />
        </button>
      </div>
    </>
  );

  return (
    // The bar is out of flow and spans the viewport, so it takes pointer events
    // off itself and hands them back to the two things that want them. A
    // transparent 80px strip swallowing clicks across the whole page would be a
    // header in name only.
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      {reduced ? (
        <Bar height={open ? TALL : SHORT} wash={1}>
          {contents}
        </Bar>
      ) : (
        <ScrubbedBar open={open}>{contents}</ScrubbedBar>
      )}

      {open && (
        <div
          id="site-menu"
          className="pointer-events-auto fixed inset-0 top-20 z-40 overflow-y-auto"
          style={{ background: "var(--site-base)" }}
        >
          <Container>
            <nav aria-label="Sections" className="flex flex-col py-6">
              {SECTIONS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="border-t py-5"
                  style={{
                    borderColor: "var(--site-line)",
                    color: "var(--site-ink)",
                    fontSize: "clamp(28px, 6vw, 44px)",
                    fontWeight: 400,
                    letterSpacing: "-0.04em",
                    lineHeight: 1.2,
                  }}
                >
                  {item.label}
                </a>
              ))}
              <Link
                href="/check"
                onClick={() => setOpen(false)}
                className="mt-8 inline-flex h-14 items-center justify-center two:hidden"
                style={{
                  background: "var(--site-ink)",
                  borderRadius: "var(--site-radius-pill)",
                  color: "#ffffff",
                  fontSize: "16px",
                  fontWeight: 600,
                }}
              >
                Check a paper
              </Link>
            </nav>
          </Container>
        </div>
      )}
    </header>
  );
}
