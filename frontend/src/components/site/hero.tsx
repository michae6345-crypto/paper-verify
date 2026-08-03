"use client";

import { useEffect, useState } from "react";
import { MotionValue, motion, useReducedMotion, useTransform } from "motion/react";
import type { ReactNode } from "react";

import { Container, PrimaryLink, Tag } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { DrawLine, Pin, Scrub } from "@/components/site/motion/scrub";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

/**
 * The hero. One claim, one sentence under it, one way in.
 *
 * The reference's heading is 44 / 80 / 108px at its three breakpoints, all at
 * -0.06em. That is a curve rather than three decisions, so `site-h1` clamps it
 * and the breakpoints go away.
 *
 * There was a second control here pointing at the BERT report. It is gone: the
 * hero asks for one thing. The report is still reached from the FAQ card and
 * from `/check`, which is where someone looking for an example already is.
 *
 * ---
 *
 * On a large enough viewport the section pins and the pipeline runs once against
 * scroll (`docs/MOTION_TEARDOWN.md` §1). Their spine is a marketing funnel; ours
 * is the real one — the five `RunStage` values a run passes through in
 * `backend/pv/orchestrator.py` — and the thing at the end of it is a verdict,
 * which is the only thing a run produces. Copy arrives as the pin releases,
 * after the demonstration has already made the argument.
 *
 * The tag and the headline are present at progress 0 and never move. A landing
 * page whose first claim is only legible after you scroll is a worse page than a
 * still one.
 *
 * **The arithmetic, because a pinned frame taller than the viewport hides its own
 * lower half.** The sticky child is exactly `100dvh`, and everything below is
 * measured against the smallest viewport we pin on, 1024 × 700:
 *
 *      64  header clearance. The header is `fixed`, not absolute, so it stands
 *          over this frame for the whole pin rather than only at scroll 0. 64 is
 *          `SHORT` in `site-header.tsx`, which is the height it holds at for all
 *          but the first 140px of scroll.
 *      40  tag
 *     128  spine band: the rule and its five nodes, each carrying a stage name
 *          and, 24px under it, the artifact that stage produces
 *     166  headline: two lines at 72px, the cap this branch applies
 *     150  the band under the headline. Three occupants, never two at once —
 *          the submitted identifier, then the verdict, then the subhead and the
 *          controls. Measured content is 138, so 12 spare
 *      60  three gaps
 *    ----
 *     608  against 700.
 *
 * The headline is two lines everywhere this pins, and that is arithmetic rather
 * than luck: the measure is `min(1000px, container)` and the size is
 * `min(72px, 5vw)`, so the characters per line only ever move between about 27
 * at 1440 and 36 at 1024, and a 46-character headline does not reach three at
 * either end. Three lines would cost 82 more and land at 690, which still fits,
 * so the frame survives a longer headline — but only just, and
 * `scripts/check-viewports.mjs` is what would say so.
 *
 * **Where 700 came from, and why the last two numbers were wrong.** They were
 * derived on paper and never checked against a browser. A real Chromium at a
 * 1920 × 1080 screen on 125% scaling reports `innerHeight` of **720** — the OS
 * scaling takes it to 1536 × 864 and the browser's own chrome takes another 144.
 * That is an ordinary Windows laptop, not an edge case, and both 860 and 760
 * excluded it. The pin is the page's signature moment and it was not running for
 * the people most likely to be looking at it.
 *
 * The lesson is the one this repo already writes down in another context: a
 * number that was reasoned about rather than measured is a number that is
 * probably wrong. `scripts/check-viewports.mjs` measures it now.
 *
 * **Why the headline is capped here and nowhere else.** `site-h1` is
 * `clamp(44px, 7.5vw, 108px)`, so the headline *grows with width* — which made
 * the old gate the wrong shape. It read `(min-width: 1100px) and
 * (min-height: 860px)`, treating width as permission when width is what spends
 * the budget: at 1100px wide the hero needed 751px, at 1440px it needed 839. The
 * true requirement was `466 + 0.2588 × width`, which no media query can express.
 * Capping the headline inside the pinned frame makes the budget flat, and a flat
 * budget is something a `min-height` query can actually answer.
 *
 * The old gate cost more than tidiness: at 860 it excluded a 1440 × 760 laptop,
 * which is one of the most common screens there is, so the page's signature
 * scroll moment simply never ran for most people who visited it.
 *
 * Below the gate we do not pin at all. The static hero underneath is the markup
 * this file has always rendered, so 390 × 700 gets a page that works rather than
 * a pin that eats half of itself. The static branch keeps the full 108px
 * headline, because nothing is competing with it there.
 *
 * `prefers-reduced-motion` takes that same static branch: final state on the
 * first paint, no scroll subscription, and no media query listener either.
 */

/**
 * The five stages a run moves through, and what each one leaves behind.
 *
 * The names are `RunStage` in `backend/pv/orchestrator.py`, minus the states a
 * run waits in and the ones it ends in.
 *
 * The artifacts are §1's "mono list items reveal beneath each stage label". They
 * are deliberately nouns and not counts: a count on this page would be a claim
 * about a specific paper, and the hero is not running a specific paper. Every one
 * of these is a real object the pipeline produces — `ingest` assembles the arXiv
 * source, `parse` builds the macro table before anything is read, `mining` turns
 * cells into claims, the checks produce comparisons, and adjudication is the only
 * step that produces a verdict.
 */
const STAGES = [
  { name: "resolving", artifact: "arxiv source" },
  { name: "extracting", artifact: "macro table" },
  { name: "mining", artifact: "claims" },
  { name: "checking", artifact: "comparisons" },
  { name: "adjudicating", artifact: "verdicts" },
] as const;

/** The spine draws across this slice. Every stage window is derived from it. */
const DRAW_FROM = 0.08;
const DRAW_TO = 0.44;

/** The window a stage label holds, placed where the line reaches it. */
function stageWindow(i: number): [number, number] {
  const arrival = DRAW_FROM + (DRAW_TO - DRAW_FROM) * ((i + 0.5) / STAGES.length);
  // Opening just before the line lands and closing well after it is what makes
  // this a stagger rather than five separate events: consecutive windows overlap
  // by more than half, so a fast scroll compresses the sequence into one gesture
  // instead of queueing five.
  return [arrival - 0.02, arrival + 0.1];
}

/**
 * The artifact under a stage, which trails its label rather than arriving with
 * it. §1 has the labels appear as the line reaches them and the mono lists
 * reveal beneath, and the order is the argument: the stage is what is happening,
 * the artifact is what it produced, so a stage whose artifact arrives first is a
 * stage reporting a result it has not computed yet.
 *
 * `+0.03` of travel behind the label. Every stage keeps the same offset, so the
 * five pairs read as one gesture repeated rather than as ten separate events.
 */
function artifactWindow(i: number): [number, number] {
  const [from, to] = stageWindow(i);
  return [from + 0.03, to + 0.03];
}

/**
 * The headline size inside the pinned frame.
 *
 * Lower than `site-h1`'s 108px ceiling, and it is what makes the pin's budget
 * independent of viewport width. Three lines at 72px and line-height 1.15 is
 * 248.4px; the block comment budgets 248.
 *
 * The width still has to hold the line. At 72px in a 1000px measure a line takes
 * roughly 28 characters, so the current 46-character headline sets in two on a
 * wide screen and three on a narrow one, and three is what is budgeted.
 *
 * This is the size the pinned hero can afford, not the size it would like. The
 * static hero keeps the full 108px. The trade is deliberate: a 72px headline
 * that pins beats a 108px headline that turns the page's signature scroll
 * moment off for anyone on a 720px viewport, which is most people.
 */
const PINNED_HEADLINE = "clamp(40px, 5vw, 72px)";

/**
 * Has this viewport room for the pin?
 *
 * Deliberately not a Tailwind breakpoint. The constraint is height as much as
 * width, and it decides which tree renders rather than how one tree looks.
 *
 * Height is the real gate now that `PINNED_HEADLINE` has flattened the budget.
 * The width term is no longer about vertical room at all — it is about the spine,
 * which lays five stage labels across the frame and needs the horizontal space to
 * do it without them colliding.
 */
function usePinnable(enabled: boolean) {
  const [pinnable, setPinnable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia("(min-width: 1024px) and (min-height: 700px)");
    const update = () => setPinnable(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [enabled]);

  return pinnable;
}

/** The inverse of `Scrub`: present, then gone. The assembly leaving as the pin releases. */
function Exit({
  progress,
  from,
  to,
  y = -32,
  children,
  className,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  y?: number;
  children: ReactNode;
  className?: string;
}) {
  const opacity = useTransform(progress, [from, to], [1, 0], { clamp: true });
  const ty = useTransform(progress, [from, to], [0, y], { clamp: true });

  return (
    <motion.div className={className} style={{ opacity, y: ty }}>
      {children}
    </motion.div>
  );
}

/**
 * A layer that is not clickable until it is visible.
 *
 * `opacity: 0` still takes a click, and the controls spend most of the pin at
 * zero directly under the headline. Without this, the top of the page has an
 * invisible link across it.
 */
function Live({
  progress,
  at,
  children,
  className,
}: {
  progress: MotionValue<number>;
  at: number;
  children: ReactNode;
  className?: string;
}) {
  const pointerEvents = useTransform(progress, (p) => (p >= at ? "auto" : "none"));

  return (
    <motion.div className={className} style={{ pointerEvents }}>
      {children}
    </motion.div>
  );
}

/**
 * The pipeline: a dormant hairline with five nodes on it, and the spine drawn
 * over it, each node carrying its stage name and then the artifact it produces.
 *
 * `h-32` rather than `h-24`: the artifact line adds 24px under the label, and
 * the block comment's budget counts 124 for this band. It is measured, not
 * assumed — `scripts/check-viewports.mjs` fails if the frame stops fitting.
 */
function Spine({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="relative h-32 w-full" aria-hidden="true">
      {/* Dormant, and present on the first frame. The spine is this same path lit. */}
      <div className="absolute inset-x-0 top-10 h-px" style={{ background: "var(--site-line)" }} />

      {/* `preserveAspectRatio="none"` stretches x only; the viewBox is two units
          tall and the element two pixels, so the stroke is not scaled. */}
      <svg
        className="absolute inset-x-0 top-[39px] h-0.5 w-full"
        viewBox="0 0 1000 2"
        preserveAspectRatio="none"
      >
        <g stroke="var(--site-ink)">
          <DrawLine
            progress={progress}
            from={DRAW_FROM}
            to={DRAW_TO}
            d="M0 1 H1000"
            strokeWidth={2}
          />
        </g>
      </svg>

      {STAGES.map((stage, i) => {
        const [from, to] = stageWindow(i);
        const [artFrom, artTo] = artifactWindow(i);
        return (
          // The `-translate-x-1/2` is a static CSS transform on a plain div that
          // Motion never touches. Every animated transform below it belongs to a
          // `Scrub`, one per element, so nothing is written twice.
          <div
            key={stage.name}
            className="absolute top-9 -translate-x-1/2"
            style={{
              left: `${((i + 0.5) / STAGES.length) * 100}%`,
              width: `${100 / STAGES.length}%`,
            }}
          >
            <div className="relative mx-auto h-2 w-2">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--site-line-strong)" }}
              />
              <Scrub progress={progress} from={from} to={to} y={0} className="absolute inset-0">
                <div className="h-2 w-2 rounded-full" style={{ background: "var(--site-ink)" }} />
              </Scrub>
            </div>

            <Scrub progress={progress} from={from} to={to} y={8}>
              <span
                className="site-mono mt-4 block text-center"
                style={{ fontSize: "12px", color: "var(--site-ink)" }}
              >
                {stage.name}
              </span>
            </Scrub>

            <Scrub progress={progress} from={artFrom} to={artTo} y={6}>
              <span
                className="site-mono mt-1.5 block text-center"
                style={{ fontSize: "11px", color: "var(--site-muted)" }}
              >
                {stage.artifact}
              </span>
            </Scrub>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What the pipeline is given, at the head of the sequence.
 *
 * §1's prompt card, which in the reference "fades and scales in at the left,
 * carrying a sentence of user intent". Ours carries the only intent this product
 * takes: an arXiv identifier. `1810.04805` is BERT, and it is in the committed
 * corpus, so the card is not illustrating with an invented paper.
 *
 * It shares the band with the verdict and the copy rather than getting a box of
 * its own, and the three never overlap in time: the input arrives during the
 * draw, leaves as the verdict resolves, and the verdict leaves as the copy
 * lands. One 150px box, three occupants, and the frame never has to be tall
 * enough to hold more than one.
 *
 * The scale is 0.96 -> 1, which is §4's figure. It does not slide in from off
 * screen, which §4 rules out in the same sentence.
 */
function Prompt({ progress }: { progress: MotionValue<number> }) {
  return (
    <Scrub progress={progress} from={0.12} to={0.26} y={10} scale={[0.96, 1]}>
      <span
        className="inline-flex items-center gap-3 px-5 py-2.5"
        style={{
          background: "var(--site-card)",
          borderRadius: "var(--site-radius-pill)",
          boxShadow: "var(--site-shadow-halo)",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--site-muted)" }}>submitted</span>
        <span className="site-mono" style={{ fontSize: "15px", color: "var(--site-ink)" }}>
          arXiv:1810.04805
        </span>
      </span>
    </Scrub>
  );
}

/**
 * What the pipeline produces at the end of the spine: one verdict, resolving out of blur.
 *
 * The halo, and the whole of it. This carried the white ring on its own for a
 * while, which is half of `--site-shadow-halo` — the half that separates the pill
 * from the spine it is sitting over, without the drop that puts it in front of it.
 * A ring with no drop reads as a gap in the page rather than an object above it,
 * and this is the one element in the hero that has to read as the thing produced
 * rather than as part of the diagram producing it.
 */
function Result({ progress }: { progress: MotionValue<number> }) {
  return (
    <Scrub progress={progress} from={0.5} to={0.68} y={12} scale={[0.96, 1]} blur={12}>
      <span
        className="inline-flex items-center gap-2.5 px-5 py-2.5"
        style={{
          background: "var(--site-card)",
          borderRadius: "var(--site-radius-pill)",
          boxShadow: "var(--site-shadow-halo)",
        }}
      >
        <VerdictGlyph verdict="diverges" size={14} />
        <span className="site-mono" style={{ fontSize: "15px", color: "var(--site-ink)" }}>
          diverges
        </span>
      </span>
    </Scrub>
  );
}

/** The hero at rest: everything resolved, nothing waiting on a scroll position. */
function StaticHero() {
  return (
    <section id="hero" className="pt-[180px] pb-[118px] three:pb-[118px]">
      <Container>
        <div className="flex flex-col items-center gap-9 text-center">
          <Reveal>
            <Tag dot>Built for conference and workshop submissions</Tag>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="site-h1 mx-auto max-w-[1000px] text-balance">
              AI-native verification for academic conferences
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="site-body mx-auto max-w-[520px] text-balance">
              It checks the numbers a paper states, the links it prints and the work it cites.
              Run it before you submit and attach the report.
            </p>
          </Reveal>

          {/* The tray stays flat, and that is not an oversight. It is 8px of white
              around the control, which is the ring half of `--site-shadow-halo`
              built out of a box instead of a shadow, and the control inside it
              already carries `.site-lift` for the drop half. Putting a shadow on
              the tray as well would be the composite wearing two, which reads as
              fog rather than as depth. */}
          <Reveal delay={0.18}>
            <div
              className="flex flex-wrap items-center justify-center gap-3 p-2"
              style={{ background: "var(--site-card)", borderRadius: "var(--site-radius-pill)" }}
            >
              <PrimaryLink href="/check">Check a paper</PrimaryLink>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/** The same hero, pinned, with the pipeline running once through it. */
function PinnedHero() {
  return (
    <div id="hero">
      <Pin height="320vh">
        {/* `pt-16`, not `pt-20`. The header is fixed and condenses to 64px after
            the first 140px of scroll, which is where it spends all but the very
            start of this pin. Clearing 80 the whole way was clearing a height the
            bar only has at scroll 0. */}
        {(progress) => (
          <Container className="flex h-full flex-col items-center justify-center gap-5 pt-16 text-center">
            <Tag dot>Built for conference and workshop submissions</Tag>

            <Exit progress={progress} from={0.7} to={0.82} className="w-full">
              <Spine progress={progress} />
            </Exit>

            {/* The one place `site-h1` is overridden. See `PINNED_HEADLINE`: the
                clamp's 108px ceiling makes the frame's height a function of its
                width, and a budget that moves with the viewport is a budget no
                media query can gate on. */}
            <h1
              className="site-h1 mx-auto max-w-[1000px] text-balance"
              style={{ fontSize: PINNED_HEADLINE }}
            >
              AI-native verification for academic conferences
            </h1>

            {/* One box, three occupants, none of them on screen at the same time
                as another. The input arrives during the draw and leaves as the
                verdict resolves; the verdict leaves as the copy lands. So the
                frame never has to be tall enough to hold more than one, which is
                what keeps this at 150 rather than at the sum of three.

                150, down from 190: the measured contents are 138 — a 44px verdict
                pill, or a two-line subhead plus a 12px gap plus a 56px control
                tray, plus 16 of `pt-4` — so 190 was carrying 52px of nothing at
                the exact point in the budget that decides whether this pins. */}
            <div className="relative h-[150px] w-full">
              <div className="absolute inset-0 flex items-start justify-center pt-4">
                <Exit progress={progress} from={0.44} to={0.54}>
                  <Prompt progress={progress} />
                </Exit>
              </div>

              <div className="absolute inset-0 flex items-start justify-center pt-4">
                <Exit progress={progress} from={0.7} to={0.82}>
                  <Result progress={progress} />
                </Exit>
              </div>

              <Live
                progress={progress}
                at={0.82}
                className="absolute inset-0 flex flex-col items-center justify-start gap-3"
              >
                <Scrub progress={progress} from={0.82} to={0.93} y={20}>
                  <p className="site-body mx-auto max-w-[520px] text-balance">
                    It checks the numbers a paper states, the links it prints and the work it
                    cites. Run it before you submit and attach the report.
                  </p>
                </Scrub>

                <Scrub progress={progress} from={0.88} to={1} y={16}>
                  <div
                    className="flex flex-wrap items-center justify-center gap-3 p-2"
                    style={{
                      background: "var(--site-card)",
                      borderRadius: "var(--site-radius-pill)",
                    }}
                  >
                    <PrimaryLink href="/check">Check a paper</PrimaryLink>
                  </div>
                </Scrub>
              </Live>
            </div>
          </Container>
        )}
      </Pin>
    </div>
  );
}

export function Hero() {
  const reduced = useReducedMotion();
  const pinnable = usePinnable(!reduced);

  if (reduced || !pinnable) return <StaticHero />;
  return <PinnedHero />;
}
