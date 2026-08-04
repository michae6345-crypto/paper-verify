"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";

import { CHECK_RUNS, PAPERS, UNVERIFIABLE_RUNS } from "@/components/site/corpus";
import { Container, Tag } from "@/components/site/ui";
import { useSectionProgress } from "@/components/site/motion/scrub";
import { Arrive } from "@/components/site/motion/mobile";

/**
 * The close: book a demo.
 *
 * ---
 *
 * **Why it is dark, and why that is not arbitrary.** Every section between the
 * hero and here is a light field, and the three that carry dark cards
 * (`decides`, `report`, and the one that used to be `roadmap`) put the dark
 * *inside* a light page rather than under it. So the page has one tonal event
 * left to spend, and this is the only place worth spending it: the first time
 * the field itself goes dark is the moment the page stops explaining and starts
 * asking. Three light sections run in front of it (`measured`, `report`, `faq`),
 * which is the flattest stretch of the page, and inverting straight out of them
 * is what stops the last screen reading as more of the same.
 *
 * It is `--site-deep` and not `--site-ink`, which matters because of what sits
 * underneath. The footer's field is pure black carrying one white notched panel.
 * At `--site-ink` this section and the footer would be one continuous black
 * region and the footer's panel would read as this section's card. At
 * `--site-deep` the page closes on three legible planes: dark grey, then black,
 * then the white panel. The step down is the point.
 *
 * **Why it does not look like the footer.** The footer is a centred column: tag,
 * one very large heading, one sentence, one pill. If this were the same
 * composition in a different colour the last two screens would be the same
 * screen twice. So the axis is turned. The ask is left-aligned in the wider
 * column, the right column carries what a demo actually consists of, and the
 * heading is `site-h2` rather than `site-h1` so the footer keeps the largest
 * type on the page and stays the last word.
 *
 * The division of labour between the two is substance and sign-off. The footer
 * has moved to a demo ask of its own (`Open to venues`, `Book a demo`), and the
 * header carries one too, so this section deliberately does not repeat the
 * button's words in its heading: it says what a demo *is* and lets the control
 * carry the ask. Three surfaces now point at `/demo` and only one of them is
 * mine, which is noted in the report rather than fixed here, because the footer
 * and the header belong to other workstreams.
 *
 * The consequence for the copy is that the closing note earns its place. The
 * footer now says `check your intake`, which a chair can easily read as "hand us
 * the submission pile". Nothing does that, so the line under the control says so
 * plainly and sits next to the ask rather than in a footnote at the end.
 *
 * **What it is allowed to claim.** The three rows are the demo, stated as facts
 * that already hold. There is deliberately no promise of a live stream of check
 * rows: `lib/stream.ts` says in its own header that there is no backend to
 * stream from yet and the sequence in the app is simulated, so a landing page
 * selling it as a feature would be the exact failure the rest of this page
 * argues against. The third row is the section's real argument and it is the
 * least flattering thing on the screen, which is why it is a row rather than a
 * footnote.
 */

/** Rows: what a demo consists of. Every one of them is true today. */
const CONSISTS_OF: { term: string; detail: string }[] = [
  {
    term: "You pick the paper",
    detail: "Any arXiv id with LaTeX source behind it. Nothing is prepared in advance.",
  },
  {
    term: "The run is the whole demo",
    detail:
      "Four checks over the paper’s own tables, links and bibliography, and the report they produce.",
  },
  {
    term: "You see where it declines",
    // The one figure on the screen, and it is the unflattering one. Both numbers
    // are bound from `corpus.ts` rather than typed, so they cannot drift from the
    // checker that produced them.
    detail: `${UNVERIFIABLE_RUNS} of the ${CHECK_RUNS} check runs over the ${PAPERS}-paper corpus came back unverifiable, each with a reason attached.`,
  },
];

/**
 * The ask, then the three rows.
 *
 * Measured in a browser at 1536x720 the section is 725px tall, so travel is
 * 1445px. The ask is one window rather than four, for the reason
 * `site-footer.tsx` records about its own CTA: a tag, a heading, a sentence and
 * a control on four staggered windows read as a card assembling itself out of
 * parts, and this is one object arriving.
 *
 * The ask and the first row open at the same 0.105, which is not a coincidence
 * to be tuned out. Both columns are `three:items-start`, so both top edges sit
 * 152px down the section and reach the fold on the same frame; opening them
 * apart would be animating a difference that is not on the screen. The ask then
 * runs the surface budget of 0.60H (432px, 0.299 of this travel) and the rows
 * run the row budget of 0.52H + h/2 (about 425px, 0.294), so the ask settles
 * while the list is still counting in under it.
 *
 * The rows are 125px apart, which is the 0.087 step.
 *
 * Below 1100px none of these are used: `Arrive` swaps to `Rise`, every element
 * is measured against its own travel, and the two columns have become two rows,
 * so a fraction of this section would have been the wrong distance anyway.
 */
const ASK_FROM = 0.105;
const ASK_TO = 0.404;

const ROW_FIRST = 0.105;
const ROW_STEP = 0.087;
const ROW_WINDOW = 0.294;

/**
 * The primary control, inverted.
 *
 * `PrimaryLink` in `ui.tsx` is a black pill carrying `.site-lift`, whose six
 * shadow stops are all black and whose last stop is an inset black glow. On a
 * `--site-deep` field the fill nearly disappears and every one of those stops
 * paints nothing. There is no inverted variant to reach for, because until this
 * section no dark surface on the page carried a control: the dark cards in
 * `decides` and `report` hold text only.
 *
 * So this is `PrimaryLink`'s geometry in white, kept here rather than added to
 * `ui.tsx` because that file is shared and this is the only caller. If a second
 * dark surface ever needs a control, this should move there rather than be
 * written a second time. The focus ring comes from the `:focus-visible` rule in
 * `globals.css` and needs nothing here.
 */
function InvertedLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    // The fill is a class rather than an inline style on purpose: an inline
    // `background` outranks `hover:bg-white/85`, so writing it the way
    // `PrimaryLink` writes its own would have left the hover doing nothing.
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 bg-white px-7 py-3.5 transition-colors hover:bg-white/85"
      style={{
        color: "var(--site-ink)",
        borderRadius: "var(--site-radius-pill)",
        fontSize: "16px",
        fontWeight: 600,
        lineHeight: 1.2,
        transitionDuration: "var(--dur-fast)",
      }}
    >
      {children}
    </Link>
  );
}

export function DemoCta() {
  const section = useRef<HTMLElement>(null);
  const progress = useSectionProgress(section);

  return (
    // The background is on the section rather than inside `Container`, so the
    // field runs to both edges of the screen while the content stays on the same
    // 1440px measure and the same gutter as every section above it.
    <section
      id="demo"
      ref={section}
      className="site-section scroll-mt-20 three:py-[152px]"
      style={{ background: "var(--site-deep)" }}
    >
      <Container>
        <div className="flex flex-col gap-12 three:flex-row three:items-start three:gap-20">
          <Arrive
            progress={progress}
            from={ASK_FROM}
            to={ASK_TO}
            kind="surface"
            y={20}
            className="flex flex-col items-start gap-6 two:gap-7"
            boxClassName="min-w-0 three:flex-1"
          >
            <Tag tone="dark">Demo</Tag>

            {/* The heading says the promise; the control says the ask. Repeating
                `Book a demo` here would have put those words on the screen three
                times inside two screens, counting the header and the footer. */}
            <h2 className="site-h2 max-w-[16ch]" style={{ color: "#ffffff" }}>
              <span style={{ color: "var(--site-muted-invert)" }}>See it run </span>
              on a paper you pick.
            </h2>

            <p
              className="max-w-[46ch]"
              style={{ fontSize: "16px", lineHeight: 1.7, color: "var(--site-muted-invert)" }}
            >
              One real run, on a paper of your choosing. Nothing is staged, so you will see the
              checks that decline as plainly as the ones that resolve.
            </p>

            <InvertedLink href="/demo">Book a demo</InvertedLink>

            {/* The limit, next to the ask rather than at the bottom of the page,
                because a chair reading this is the reader who would otherwise
                form the wrong expectation. `report.tsx` already says there is no
                endpoint a venue can call; this says the other half, which is
                that there is no way to hand it a stack of submissions either. */}
            <p style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}>
              One paper at a time. Running a batch for a venue is not built.
            </p>
          </Arrive>

          <dl className="flex min-w-0 flex-col three:w-[420px] three:shrink-0">
            {CONSISTS_OF.map((item, i) => {
              const from = ROW_FIRST + i * ROW_STEP;
              return (
                <Arrive
                  key={item.term}
                  progress={progress}
                  from={from}
                  to={from + ROW_WINDOW}
                  lead={i * 0.02}
                  y={14}
                  className={
                    i === 0
                      ? "flex flex-col gap-1.5 pb-6"
                      : "flex flex-col gap-1.5 border-t border-t-[var(--site-line-invert)] pt-6 pb-6"
                  }
                >
                  <dt
                    style={{
                      fontSize: "16px",
                      lineHeight: 1.6,
                      letterSpacing: "-0.01em",
                      color: "#ffffff",
                    }}
                  >
                    {item.term}
                  </dt>
                  <dd
                    className="max-w-[52ch]"
                    style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}
                  >
                    {item.detail}
                  </dd>
                </Arrive>
              );
            })}
          </dl>
        </div>
      </Container>
    </section>
  );
}
