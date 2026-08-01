import { Container, PrimaryLink, Tag } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";

/**
 * The closing card, which is the CTA and the footer in one object — the way the
 * reference has it, and the reason the site layout has no separate footer.
 *
 * A black full-height panel carrying one light card: a soft white wash from the
 * lower left, the reference's own 256px noise tile over it, and a wedge notched
 * out of each corner. The wedge is one SVG from `public/assets/`, rotated four
 * ways, rather than the four near-identical files the capture ships.
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
  return (
    <footer style={{ background: "var(--site-ink)" }}>
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

          <div className="relative flex flex-col items-center gap-8 text-center">
            <Reveal>
              <Tag dot>Open to papers</Tag>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="site-h1">
                <span style={{ color: "var(--site-muted)" }}>Let&rsquo;s </span>
                check a paper
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="site-body mx-auto max-w-[52ch]">
                residual verifies the numbers in a paper against the numbers its own tables state.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <PrimaryLink href="/check">Check a paper</PrimaryLink>
            </Reveal>
          </div>

          {/* Not in the capture, and kept anyway. This product's whole argument
              is that it says what it cannot do; a landing page that closes on
              "check a paper" without mentioning that runs do not survive a
              restart would be the one place it stopped doing that. */}
          <Reveal delay={0.24} className="relative mt-14">
            <p
              className="mx-auto max-w-[68ch] text-center"
              style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--site-muted)" }}
            >
              In development. Four checks are implemented and validated against the corpus in this
              repository. Runs are held in memory, so they do not survive a restart and permalinks
              are not durable yet.
            </p>
          </Reveal>

          <div className="relative mt-10 flex flex-col items-center justify-between gap-6 two:flex-row">
            <p
              className="px-5 py-2.5"
              style={{
                background: "var(--site-card)",
                borderRadius: "var(--site-radius-pill)",
                fontSize: "14px",
                color: "var(--site-ink)",
              }}
            >
              &copy; residual, 2026
            </p>

            <nav aria-label="Elsewhere" className="flex flex-wrap items-center justify-center gap-2">
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
        </div>
      </Container>
    </footer>
  );
}
