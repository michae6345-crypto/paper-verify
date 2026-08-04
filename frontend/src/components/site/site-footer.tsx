"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/site/ui";
import { MotionControl } from "@/components/site/motion-control";
import { Reveal } from "@/components/site/reveal";
import { SECTIONS } from "@/components/site/site-header";

/**
 * The footer. Identity, navigation, copyright, and the motion control.
 *
 * **It used to be a second call to action** and that was the problem with it. It
 * opened with a tag, a `site-h1` heading, a sentence of pitch and a `Book a demo`
 * pill, which put the same ask on screen twice in a row: `DemoCta` is the dark
 * section directly above, it is the page's deliberate closing moment, and the
 * header carries a third copy of the button at all times. One target, three
 * surfaces, one screenful. `DemoCta` keeps the ask and this gives way.
 *
 * What is left is what a footer is for. The wordmark and one line saying what the
 * product does, the four section anchors, three links off the site, the
 * copyright, and the motion control. No heading, no pitch, no button.
 *
 * The card was `min-h-[834px]` on a wide screen to hold the display heading it no
 * longer has. With the heading gone the height is whatever the two columns need,
 * which is roughly 380px, and the page ends about 450px sooner.
 *
 * `SECTIONS` is imported from `site-header.tsx` rather than copied. The ids are
 * checked against the rendered page rather than against either file, several of
 * those sections belong to other people, and an anchor that no longer resolves is
 * a link that silently does nothing. One list can be wrong once; two lists drift.
 *
 * **Motion.** `Reveal`, not the scrub primitives this file used to run on. The
 * footer is the last element in the document, so its bottom edge can never reach
 * the top of the viewport and `useSectionProgress` never delivers the back half of
 * its travel. The old windows were tuned around that ceiling, closing at 0.34
 * because anything past it never opened. Shortening the card moves the ceiling
 * down again, to roughly 0.29 of the travel on a 720px screen, so the windows
 * would have needed retuning to a number that changes with the viewport. `Reveal`
 * fires once on arrival and finishes, which is the honest primitive for an element
 * that can never fully travel.
 *
 * A black full-height panel carrying one light card: a soft white wash from the
 * lower left, the reference's own 256px noise tile over it, and a wedge notched
 * out of each corner. The wedge is one SVG from `public/assets/`, rotated four
 * ways, rather than the four near-identical files the capture ships.
 *
 * The panel itself takes no elevation and cannot. Every stop in every shadow here
 * is black at some alpha, and the field it would fall on is `--site-ink`, which is
 * black at full. A light panel on a black field is already two planes; the notched
 * corners and the wash are what separate them, and a shadow would be a token spent
 * where nothing can see it.
 *
 * Social links. The capture's still point at the template's author: an Instagram
 * and an X handle that are not ours, a LinkedIn with no path on it at all, and a
 * mailto written as `https://hello@stfn.co`, which is not a URL. All four are
 * gone. GitHub points at this project's owner. Instagram and X point at the same
 * place as placeholders, because no handles have been given for them and inventing
 * two on a page that argues against inventing anything would be a strange thing to
 * do.
 *
 * They are labelled rather than iconised. Lucide dropped its brand marks at v1,
 * and drawing three companies' logos from memory to fill three 40px circles is
 * a worse outcome than three legible words.
 */

const SOCIAL_URL = "https://github.com/michae6345-crypto";

const SOCIAL = [
  { label: "GitHub", href: SOCIAL_URL },
  // Placeholders. Repointed the day there are handles to point them at.
  { label: "Instagram", href: SOCIAL_URL },
  { label: "X", href: SOCIAL_URL },
];

/** One corner notch. The asset is drawn for the top-left; the rest are rotations. */
function Corner({ className, rotate }: { className: string; rotate: number }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-8 w-8 ${className}`}
      style={{
        background: "var(--site-ink)",
        maskImage: "url(/assets/Cy4Y373j3W6Y5YXe0SRDbsV760.svg)",
        WebkitMaskImage: "url(/assets/Cy4Y373j3W6Y5YXe0SRDbsV760.svg)",
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        transform: `rotate(${rotate}deg)`,
      }}
    />
  );
}

/**
 * The label over a column of links. Instrument Serif italic, which is how this
 * page names a group of things everywhere else. Not an uppercase 11px label:
 * that is the application's voice, and this surface does not speak it.
 */
function ColumnHead({ children }: { children: ReactNode }) {
  return (
    <p className="site-display mb-1" style={{ fontSize: "17px", color: "var(--site-muted)" }}>
      {children}
    </p>
  );
}

/**
 * A footer link. 44px tall, which is the touch floor rather than a design choice:
 * these stack into a single column on a phone and a 15px line on its own is a
 * 24px target.
 *
 * Muted at rest and ink on hover, so a column of them reads as one quiet block
 * and the one under the pointer separates from it. The links used to be bordered
 * pills, which made a footer of eight links look like a tray of eight controls.
 */
/**
 * The colour is a class and not an inline style, which is the trap `demo-cta.tsx`
 * records about its own control: an inline `color` outranks `hover:text-…`, so
 * writing the resting colour the way the rest of this file writes its colours
 * would leave the hover doing nothing at all.
 */
const LINK_CLASS =
  "inline-flex min-h-[44px] items-center text-[var(--site-muted)] transition-colors hover:text-[var(--site-ink)]";

const LINK_STYLE = {
  fontSize: "15px",
  transitionDuration: "var(--dur-fast)",
} as const;

export function SiteFooter() {
  return (
    // `py-6` here rather than `my-6` on the card. Nothing between the card and
    // this element stopped that margin collapsing: neither `Container` nor
    // `Reveal`'s wrapper carries padding or a border, so it collapsed out to the
    // footer itself, which is a flex item of the site layout's column. The result
    // was 24px of the page's own grey showing between the dark closing section and
    // the black footer field. Padding on the field cannot collapse out of it.
    <footer className="py-6" style={{ background: "var(--site-ink)" }}>
      <Container>
        <Reveal y={16}>
          <div
            className="relative overflow-hidden px-6 py-9 two:px-10 two:py-10 three:px-14"
            style={{
              background: "var(--site-base)",
              borderRadius: "var(--site-radius-card)",
            }}
          >
            {/* The wash, and the reference's noise tile over it. Both decorative,
                both behind everything, neither announced. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 30% 110%, #ffffff 0%, #ffffff 30%, rgba(255,255,255,0) 72%)",
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: "url(/assets/6mcf62RlDfRfU61Yg5vb2pefpi4.png)",
                backgroundRepeat: "repeat",
                backgroundSize: "256px 256px",
                opacity: 0.35,
                mixBlendMode: "multiply",
              }}
            />

            <Corner className="top-0 left-0" rotate={0} />
            <Corner className="top-0 right-0" rotate={90} />
            <Corner className="right-0 bottom-0" rotate={180} />
            <Corner className="bottom-0 left-0" rotate={270} />

            <div className="relative flex flex-col gap-9 two:flex-row two:justify-between two:gap-12">
              <div className="max-w-[36ch]">
                <Link
                  href="/"
                  className="inline-flex min-h-[44px] items-center"
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    color: "var(--site-ink)",
                  }}
                >
                  residual
                </Link>
                <p style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-muted)" }}>
                  It reads a paper&rsquo;s LaTeX source and checks whether the numbers printed in it
                  agree with each other.
                </p>
              </div>

              {/* Two columns on anything wider than a phone, and they wrap rather
                  than shrink: a 390px screen gets one column under the other, in
                  the order the page would want them read. */}
              <div className="flex flex-wrap gap-x-12 gap-y-8 two:gap-x-16">
                <nav aria-label="On this page" className="flex flex-col">
                  <ColumnHead>On this page</ColumnHead>
                  {SECTIONS.map((item) => (
                    <a key={item.href} href={item.href} className={LINK_CLASS} style={LINK_STYLE}>
                      {item.label}
                    </a>
                  ))}
                </nav>

                <nav aria-label="Elsewhere" className="flex flex-col">
                  <ColumnHead>Elsewhere</ColumnHead>
                  {SOCIAL.map((item) => (
                    <a key={item.label} href={item.href} className={LINK_CLASS} style={LINK_STYLE}>
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>
            </div>

            {/* The foot of the card: what year it is, and whether the page moves.
                The motion control lives here, quiet and findable, and it stays
                here. A control that decides whether the page animates is a
                setting, and a setting competing with a call to action is a worse
                header. This page is entirely scroll-driven, so a reader whose
                device reports `prefers-reduced-motion` sees a still page with no
                way to know there was anything to see. The footer is where they
                end up, and it is where the answer is. */}
            <div
              className="relative mt-9 flex flex-col gap-5 pt-6 two:flex-row two:items-center two:justify-between"
              style={{ borderTop: "1px solid var(--site-line)" }}
            >
              <p style={{ fontSize: "14px", color: "var(--site-muted)" }}>&copy; residual, 2026</p>
              <MotionControl tone="light" />
            </div>
          </div>
        </Reveal>
      </Container>
    </footer>
  );
}
