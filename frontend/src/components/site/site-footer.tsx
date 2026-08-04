"use client";

import { useRef } from "react";

import { Container, PrimaryLink, Tag } from "@/components/site/ui";
import { Scrub, useSectionProgress } from "@/components/site/motion/scrub";

/**
 * The closing card, which is the CTA and the footer in one object — the way the
 * reference has it, and the reason the site layout has no separate footer.
 *
 * It arrives the same way: one object. The tag, the heading, the sentence and
 * the control were four staggered reveals, which read as a card assembling
 * itself out of parts. They now share one window, so the whole CTA comes up as
 * the thing it is, and only the status note and the foot of the card follow it.
 *
 * The windows all close by 0.34 of the section's travel, which looks early and
 * is not. This is the last element in the document: its bottom edge can never
 * reach the top of the viewport, so `useSectionProgress` here tops out somewhere
 * around 0.4 on a tall screen and never delivers the other 0.6. A window past
 * that point is a window that never opens.
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
 * Social links. The capture's still point at the template's author — an
 * Instagram and an X handle that are not ours, a LinkedIn with no path on it at
 * all, and a mailto written as `https://hello@stfn.co`, which is not a URL. All
 * four are gone. GitHub points at this project's owner. Instagram and X point at
 * the same place as placeholders, because no handles have been given for them
 * and inventing two on a page that argues against inventing anything would be a
 * strange thing to do.
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

export function SiteFooter() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    <footer ref={section} style={{ background: "var(--site-ink)" }}>
      <Container>
        <div
          className="relative my-6 flex min-h-[560px] flex-col justify-end overflow-hidden px-6 py-10 three:min-h-[834px] three:px-28"
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

          <Scrub
            progress={progress}
            from={0.06}
            to={0.28}
            y={44}
            scale={[0.97, 1]}
            className="relative flex flex-col items-center gap-8 text-center"
          >
            <Tag dot>Open to papers</Tag>
            <h2 className="site-h1">
              <span style={{ color: "var(--site-muted)" }}>Let&rsquo;s </span>
              check a paper
            </h2>
            <p className="site-body mx-auto max-w-[52ch]">
              residual checks a paper&rsquo;s numbers, links and citations against its own source.
            </p>
            <PrimaryLink href="/check">Check a paper</PrimaryLink>
          </Scrub>

          {/* Not in the capture, and kept anyway. This product's whole argument
              is that it says what it cannot do; a landing page that closes on
              "check a paper" without mentioning that runs do not survive a
              restart would be the one place it stopped doing that. */}
          <Scrub progress={progress} from={0.18} to={0.32} y={24} className="relative mt-14">
            <p
              className="mx-auto max-w-[68ch] text-center"
              style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--site-muted)" }}
            >
              In development. Runs live in memory, so they do not survive a restart and permalinks
              are not durable yet.
            </p>
          </Scrub>

          <Scrub progress={progress} from={0.22} to={0.34} y={20} className="relative mt-10">
            <div className="flex flex-col items-center justify-between gap-6 two:flex-row">
              {/* The one element in the footer that needed a shadow. It is a
                  filled pill with no border, sitting on the white end of the
                  wash, so it had no edge at all; the links beside it are bordered
                  and do not need one. They stay unshadowed on purpose — a link
                  wearing a drop shadow is a link asking to be read as a button. */}
              <p
                className="site-resting px-5 py-2.5"
                style={{
                  background: "var(--site-card)",
                  borderRadius: "var(--site-radius-pill)",
                  fontSize: "14px",
                  color: "var(--site-ink)",
                }}
              >
                &copy; residual, 2026
              </p>

              <nav
                aria-label="Elsewhere"
                className="flex flex-wrap items-center justify-center gap-2"
              >
                {SOCIAL.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="px-5 py-2.5 transition-colors"
                    style={{
                      border: "1px solid var(--site-line)",
                      borderRadius: "var(--site-radius-pill)",
                      fontSize: "14px",
                      color: "var(--site-ink)",
                      transitionDuration: "var(--dur-fast)",
                    }}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </Scrub>
        </div>
      </Container>
    </footer>
  );
}
