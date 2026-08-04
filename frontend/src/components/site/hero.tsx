"use client";

import { useEffect, useState } from "react";
import { MotionValue, motion, useTransform } from "motion/react";
import type { ReactNode } from "react";

import { Container, PrimaryLink, Tag } from "@/components/site/ui";
import { HeroBubbles } from "@/components/site/bubbles";
import { Reveal } from "@/components/site/reveal";
import { DrawLine, Pin, Scrub, useReducedMotionGate } from "@/components/site/motion/scrub";
import { Rise, SpineList, type SpineWindow } from "@/components/site/motion/mobile";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

/**
 * The hero. One claim, one sentence under it, one way in.
 *
 * The reference's heading is 44 / 80 / 108px at its three breakpoints, all at
 * -0.06em. That is a curve rather than three decisions, so `site-h1` clamps it
 * and the breakpoints go away.
 *
 * On a large enough viewport the section pins and the pipeline runs once against
 * scroll (`docs/MOTION_TEARDOWN.md` §1). The spine is the five `RunStage` values
 * a run passes through in `backend/pv/orchestrator.py`, and the thing at the end
 * of it is a verdict, which is the only thing a run produces. Copy arrives as
 * the pin releases, after the demonstration has made the argument.
 *
 * The tag and the headline are present at progress 0 and never move. A landing
 * page whose first claim is only legible after you scroll is a worse page than a
 * still one.
 *
 * **The arithmetic, because a pinned frame taller than the viewport hides its own
 * lower half.** The sticky child is exactly `100dvh`, and everything below is
 * measured against the smallest viewport we pin on, 1024 x 700:
 *
 *      64  header clearance. The header is `fixed`, not absolute, so it stands
 *          over this frame for the whole pin rather than only at scroll 0. 64 is
 *          `SHORT` in `site-header.tsx`, which is the height it holds at for all
 *          but the first 140px of scroll.
 *      40  tag
 *     128  spine band: the rule and its five nodes, each carrying a stage name
 *          and, 24px under it, the artifact that stage produces
 *     166  headline: two lines at 72px, the cap this branch applies
 *     150  the band under the headline. Three occupants, never two at once:
 *          the submitted identifier, then the verdict, then the subhead and the
 *          controls. Measured content is 138, so 12 spare
 *      60  three gaps
 *    ----
 *     608  against 700.
 *
 * The headline is two lines everywhere this pins, and that is arithmetic rather
 * than luck: the measure is `min(1000px, container)` and the size is
 * `min(72px, 5vw)`, so the characters per line only ever move between about 27
 * at 1440 and 36 at 1024, and a 45-character headline does not reach three at
 * either end. Three lines would cost 82 more and land at 690, which still fits,
 * so the frame survives a longer headline, but only just, and
 * `scripts/check-viewports.mjs` is what would say so.
 *
 * **Where 700 came from.** A real Chromium at a 1920 x 1080 screen on 125%
 * scaling reports `innerHeight` of **720**: the OS scaling takes it to
 * 1536 x 864 and the browser's own chrome takes another 144. That is an ordinary
 * Windows laptop, and the earlier floors of 860 and 760 both excluded it, so the
 * page's signature moment was not running for the people most likely to be
 * looking at it. `scripts/check-viewports.mjs` measures it now.
 *
 * **Why the headline is capped here and nowhere else.** `site-h1` is
 * `clamp(44px, 7.5vw, 108px)`, so the headline grows with width, which is what
 * made a width-based gate the wrong shape: at 1100px wide the hero needed 751px
 * and at 1440px it needed 839, a requirement of `466 + 0.2588 x width` that no
 * media query can express. Capping the headline inside the pinned frame makes
 * the budget flat, and a flat budget is something a `min-height` query can
 * answer.
 *
 * Below the gate nothing pins. `FlowHero` runs the same sequence down the screen
 * instead of across it: the claim first, then the pipeline drawn vertically as
 * the reader scrolls through it, ending on the verdict.
 *
 * `prefers-reduced-motion` takes that same branch, resolved: `Rise`, `SpineList`
 * and `DrawLine` all paint their final state on the first frame, so a reader who
 * asked for less motion gets the whole demonstration as a static diagram.
 */

/**
 * The five stages a run moves through, and what each one leaves behind.
 *
 * The names are `RunStage` in `backend/pv/orchestrator.py`, minus the states a
 * run waits in and the ones it ends in.
 *
 * The artifacts are §1's "mono list items reveal beneath each stage label", and
 * they are nouns rather than counts on purpose: a count here would be a claim
 * about a specific paper, and the hero is not running one. Each is a real object
 * the pipeline produces.
 */
const STAGES = [
  { name: "resolving", artifact: "arxiv source" },
  { name: "extracting", artifact: "macro table" },
  { name: "mining", artifact: "claims" },
  { name: "checking", artifact: "comparisons" },
  { name: "adjudicating", artifact: "verdicts" },
] as const;

/**
 * The claim, the sentence under it, and the one control.
 *
 * Stated once because the hero renders twice, pinned above 1024 x 700 and in
 * flow below it, and copy that disagreed with itself across a breakpoint is the
 * failure `CLAUDE.md` records about the two `latexutil.py` modules: nothing
 * reads both, so no file read reveals the drift.
 *
 * The claim is about order. The mechanical pass runs before a reviewer spends
 * attention, so what a reviewer opens is a paper whose arithmetic has already
 * been checked. `residual` does not rank the work, and the second clause of the
 * subhead says what the run declined to settle, because that is the half a chair
 * has to be able to see.
 *
 * No figure appears here and none is coming: this page holds every number on it
 * to something in the repository, and conference submission growth is not in the
 * repository.
 *
 * The headline is 45 characters, which is what `PINNED_HEADLINE`'s two-line
 * budget affords. The arithmetic is at the top of this file and
 * `scripts/check-viewports.mjs` enforces it.
 */
const TAG = "Built for conference and workshop intake";
const HEADLINE = "Check every submission before a reviewer does";
const SUBHEAD =
  "Submissions grow faster than reviewer hours. residual runs the mechanical checks " +
  "and reports what it could not verify.";

/**
 * The public way in. The checker itself now sits behind a gate, so the control a
 * visitor meets books a conversation rather than starting a run.
 */
const CTA = { href: "/demo", label: "Book a demo" } as const;

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
 * roughly 28 characters, so the current 45-character headline sets in two on a
 * wide screen and three on a narrow one, and three is what is budgeted.
 *
 * The static hero keeps the full 108px. The trade is deliberate: a 72px headline
 * that pins beats a 108px headline that turns the page's signature scroll moment
 * off for anyone on a 720px viewport, which is most people.
 */
const PINNED_HEADLINE = "clamp(40px, 5vw, 72px)";

/**
 * Has this viewport room for the pin?
 *
 * Deliberately not a Tailwind breakpoint. The constraint is height as much as
 * width, and it decides which tree renders rather than how one tree looks.
 *
 * Height is the real gate now that `PINNED_HEADLINE` has flattened the budget.
 * The width term is about the spine, which lays five stage labels across the
 * frame and needs the horizontal space to do it without them colliding.
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
 * the block comment's budget counts 124 for this band. It is measured rather than
 * assumed, and `scripts/check-viewports.mjs` fails if the frame stops fitting.
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
 * takes, an arXiv identifier. `1810.04805` is BERT and it is in the committed
 * corpus, so the card illustrates with a real paper.
 *
 * It shares the 150px band with the verdict and the copy, and the three never
 * overlap in time: the input arrives during the draw, leaves as the verdict
 * resolves, and the verdict leaves as the copy lands. The scale is 0.96 -> 1,
 * which is §4's figure, and nothing slides in from off screen.
 */
function Prompt() {
  return (
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
  );
}

/** The pinned branch's arrival for it. The flow branch uses `Rise` instead. */
function ScrubbedPrompt({ progress }: { progress: MotionValue<number> }) {
  return (
    <Scrub progress={progress} from={0.12} to={0.26} y={10} scale={[0.96, 1]}>
      <Prompt />
    </Scrub>
  );
}

/**
 * What the pipeline produces at the end of the spine: one verdict, resolving out of blur.
 *
 * The whole halo, ring and drop. The ring separates the pill from the spine it
 * sits over; without the drop it reads as a gap in the page rather than an
 * object above it, and this is the one element in the hero that has to read as
 * the thing produced rather than as part of the diagram producing it.
 */
function Result() {
  return (
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
  );
}

/**
 * The pinned branch's arrival for it, carrying the blur.
 *
 * §4 of the teardown spends blur exactly once, on the one element that matters,
 * and this is that element in both branches. The flow hero passes `blur` to its
 * `Rise` for the same reason, and nothing else on the page has it.
 */
function ScrubbedResult({ progress }: { progress: MotionValue<number> }) {
  return (
    <Scrub progress={progress} from={0.5} to={0.68} y={12} scale={[0.96, 1]} blur={12}>
      <Result />
    </Scrub>
  );
}

/**
 * The hero where it cannot pin: the same sequence, run down the screen.
 *
 * **The order inverts.** A pinned frame holds still while its contents advance,
 * which is what buys the pinned branch the right to open on a diagram and arrive
 * at the copy 80% of the way through, since the reader cannot leave until it has
 * finished. Take the pin away and that ordering becomes a landing page whose
 * first screen is an unexplained line with five words on it and whose claim is
 * three hundred pixels below the fold. So here the claim is still and the
 * demonstration is what scrolls.
 *
 * **The spine is vertical.** The width term in `usePinnable` is about the five
 * stage labels needing room to sit side by side. At 390px they do not have it,
 * and no type size rescues five words across 342 pixels. Turned through ninety
 * degrees the spine runs the same way the reader's thumb already is.
 * `SpineList` in `motion/mobile.tsx` owns the mechanic.
 *
 * The three elements the pin shares between one 150px band are not sharing
 * anything here. With no height budget to meet, the identifier sits at the head
 * of the pipeline where it is the input and the verdict sits at the foot where
 * it is the output, both on screen at once by the end.
 *
 * Everything below the fold is scrubbed against its own travel, so it runs
 * backwards, stalls when the reader stalls, and compresses under a flick. The
 * four elements above the fold are `Reveal`, because an element already on
 * screen when the page loads has no scroll position to be driven by.
 */
function FlowHero() {
  return (
    <section id="hero" className="pt-[104px] pb-16 two:pt-[150px] two:pb-24">
      <Container>
        <div className="mx-auto flex max-w-[720px] flex-col items-center gap-5 text-center two:gap-7">
          <Reveal>
            <Tag dot>{TAG}</Tag>
          </Reveal>

          <Reveal delay={0.06}>
            {/* No `progress`, so nothing here opens a scroll subscription. The
                static hero is also the reduced-motion branch. */}
            <HeroBubbles>
              <h1 className="site-h1 mx-auto max-w-[1000px] text-balance">{HEADLINE}</h1>
            </HeroBubbles>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="site-body mx-auto max-w-[52ch] text-balance">{SUBHEAD}</p>
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
              <PrimaryLink href={CTA.href} prefetch={false}>
                {CTA.label}
              </PrimaryLink>
            </div>
          </Reveal>
        </div>

        {/* The demonstration. Capped at a column rather than run to the measure:
            this branch also serves a 1024 x 640 window and a tablet held
            upright, and a spine stretched across 900px with 40px of text beside
            it is a diagram of nothing. */}
        <div className="mx-auto mt-14 flex max-w-[420px] flex-col gap-5 two:mt-20">
          <Rise kind="surface" y={10} scale={[0.96, 1]} className="flex justify-center">
            <Prompt />
          </Rise>

          <SpineList
            count={STAGES.length}
            rowClassName="pb-1"
            renderRow={(i, window) => <StageRow index={i} window={window} />}
          />

          <Rise kind="surface" y={12} scale={[0.96, 1]} blur={10} className="flex justify-center">
            <Result />
          </Rise>
        </div>
      </Container>
    </section>
  );
}

/**
 * One stage of the vertical pipeline: what is happening, and what it leaves
 * behind, on one line.
 *
 * Set as a ledger rather than as a centred pair, because that is what the two
 * strings are, a stage and its artifact, and a phone has exactly enough width
 * for the relationship to be legible if it is stated as one. The artifact still
 * trails its stage, on the same offset every stage uses, so the five pairs read
 * as one gesture repeated.
 */
function StageRow({ index, window }: { index: number; window: SpineWindow }) {
  const stage = STAGES[index];
  const trail = (window.to - window.from) * 0.14;

  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3" style={ROW_RULE}>
      <Scrub progress={window.progress} from={window.from} to={window.to} y={8}>
        <span className="site-mono" style={{ fontSize: "14px", color: "var(--site-ink)" }}>
          {stage.name}
        </span>
      </Scrub>
      <Scrub
        progress={window.progress}
        from={window.from + trail}
        to={window.to + trail}
        y={6}
        className="text-right"
      >
        <span className="site-mono" style={{ fontSize: "12px", color: "var(--site-muted)" }}>
          {stage.artifact}
        </span>
      </Scrub>
    </div>
  );
}

/** The hairline under a stage row. The last one keeps it: the list ends on a rule. */
const ROW_RULE = { borderColor: "var(--site-line)" } as const;

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
            <Tag dot>{TAG}</Tag>

            <Exit progress={progress} from={0.7} to={0.82} className="w-full">
              <Spine progress={progress} />
            </Exit>

            {/* The one place `site-h1` is overridden. See `PINNED_HEADLINE`: the
                clamp's 108px ceiling makes the frame's height a function of its
                width, and a budget that moves with the viewport is a budget no
                media query can gate on.

                The bubbles cost this frame nothing. They are absolutely
                positioned beside the headline, measured at 0px of added height
                across seven widths, and they only render at 1280 and above,
                where there is clear space either side of a 1000px measure. The
                pin's budget is unchanged at 608 against 700. */}
            <HeroBubbles progress={progress}>
              <h1
                className="site-h1 mx-auto max-w-[1000px] text-balance"
                style={{ fontSize: PINNED_HEADLINE }}
              >
                {HEADLINE}
              </h1>
            </HeroBubbles>

            {/* One box, three occupants, none of them on screen at the same time
                as another. The input arrives during the draw and leaves as the
                verdict resolves; the verdict leaves as the copy lands. So the
                frame never has to be tall enough to hold more than one, which is
                what keeps this at 150 rather than at the sum of three.

                150 rather than 190: the measured contents are 138, which is a 44px
                verdict pill, or a two-line subhead plus a 12px gap plus a 56px
                control tray, plus 16 of `pt-4`. 190 carried 52px of nothing at
                the exact point in the budget that decides whether this pins. */}
            <div className="relative h-[150px] w-full">
              <div className="absolute inset-0 flex items-start justify-center pt-4">
                <Exit progress={progress} from={0.44} to={0.54}>
                  <ScrubbedPrompt progress={progress} />
                </Exit>
              </div>

              <div className="absolute inset-0 flex items-start justify-center pt-4">
                <Exit progress={progress} from={0.7} to={0.82}>
                  <ScrubbedResult progress={progress} />
                </Exit>
              </div>

              <Live
                progress={progress}
                at={0.82}
                className="absolute inset-0 flex flex-col items-center justify-start gap-3"
              >
                <Scrub progress={progress} from={0.82} to={0.93} y={20}>
                  <p className="site-body mx-auto max-w-[520px] text-balance">{SUBHEAD}</p>
                </Scrub>

                <Scrub progress={progress} from={0.88} to={1} y={16}>
                  <div
                    className="flex flex-wrap items-center justify-center gap-3 p-2"
                    style={{
                      background: "var(--site-card)",
                      borderRadius: "var(--site-radius-pill)",
                    }}
                  >
                    <PrimaryLink href={CTA.href} prefetch={false}>
                      {CTA.label}
                    </PrimaryLink>
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
  // The gate, not `motion`'s `useReducedMotion`. This picks between two
  // structurally different trees, and `motion`'s hook reads `false` on the
  // server and the truth on a reduced-motion reader's first client render,
  // the hazard `motion/scrub.tsx` documents at length. It was survivable here
  // only because `usePinnable` also starts `false`, which is a coincidence of
  // initial state rather than a reason.
  const reduced = useReducedMotionGate();
  const pinnable = usePinnable(!reduced);

  if (pinnable) return <PinnedHero />;
  return <FlowHero />;
}
