"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
 */

const SECTIONS = [
  { href: "#intro", label: "What it does" },
  { href: "#process", label: "How a run proceeds" },
  { href: "#checks", label: "The checks" },
  { href: "#decides", label: "How it decides" },
  { href: "#measured", label: "Measured" },
  { href: "#faq", label: "Questions" },
  { href: "#roadmap", label: "What's next" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

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

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <Container>
        <div className="flex h-20 items-center justify-between">
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
        </div>
      </Container>

      {open && (
        <div
          id="site-menu"
          className="fixed inset-0 top-20 z-40 overflow-y-auto"
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
