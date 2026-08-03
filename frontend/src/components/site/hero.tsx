"use client";

import { useEffect, useState } from "react";
import { MotionValue, motion, useReducedMotion, useTransform } from "motion/react";
import type { ReactNode } from "react";

import { Container, GhostLink, PrimaryLink, Tag } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { DrawLine, Pin, Scrub } from "@/components/site/motion/scrub";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

/**
 * The hero. One claim, one sentence under it, and two ways in.
 *
 * The reference's heading is 44 / 80 / 108px at its three breakpoints, all at
 * -0.06em. That is a curve rather than three decisions, so `site-h1` clamps it
 * and the breakpoints go away.
 *
 * The second control in the capture is an icon with no label, which is a link a
 * screen reader announces as nothing at all. It goes to the BERT report, so it
 * says so.
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
 * measured against the smallest viewport we pin on, 1100 × 860:
 *
 *      80  header clearance — the header is `absolute`, so it covers the top of
 *          the frame at scroll 0 and never again
 *      40  tag
 *      96  spine band
 *     373  headline: three lines at the clamp's 108px ceiling, which is its worst
 *          case, reached at 1440px wide and never exceeded above it
 *     190  the band under the headline — the verdict, then the subhead and the
 *          controls, in the same box
 *      60  three gaps
 *    ----
 *     839  against 860.
 *
 * Below that we do not pin at all. The static hero underneath is the markup this
 * file has always rendered, so 390 × 700 gets a page that works rather than a pin
 * that eats half of itself.
 *
 * `prefers-reduced-motion` takes that same static branch: final state on the
 * first paint, no scroll subscription, and no media query listener either.
 */

/** The five stages a run moves through. `RunStage`, minus the waits and the ends. */
const STAGES = ["resolving", "extracting", "mining", "checking", "adjudicating"] as const;

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
 * Has this viewport room for the pin?
 *
 * Deliberately not a Tailwind breakpoint. The constraint is height as much as
 * width, and it decides which tree renders rather than how one tree looks.
 */
function usePinnable(enabled: boolean) {
  const [pinnable, setPinnable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia("(min-width: 1100px) and (min-height: 860px)");
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

/** The pipeline: a dormant hairline with five nodes on it, and the spine drawn over it. */
function Spine({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="relative h-24 w-full" aria-hidden="true">
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
        return (
          <div
            key={stage}
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
                style={{ fontSize: "12px", color: "var(--site-muted)" }}
              >
                {stage}
              </span>
            </Scrub>
          </div>
        );
      })}
    </div>
  );
}

/** What the pipeline produces at the end of the spine: one verdict, resolving out of blur. */
function Result({ progress }: { progress: MotionValue<number> }) {
  return (
    <Scrub progress={progress} from={0.5} to={0.68} y={12} scale={[0.96, 1]} blur={12}>
      <span
        className="inline-flex items-center gap-2.5 px-5 py-2.5"
        style={{
          background: "var(--site-card)",
          borderRadius: "var(--site-radius-pill)",
          boxShadow: "0 0 0 8px rgba(255,255,255,0.35)",
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
              A verification layer for papers under submission
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="site-body mx-auto max-w-[560px] text-balance">
              residual checks whether the numbers a paper states agree with each other. An author
              runs it before submitting and attaches the report. A reviewer or chair reads it
              instead of redoing the arithmetic by hand.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div
              className="flex flex-wrap items-center justify-center gap-3 p-2"
              style={{ background: "var(--site-card)", borderRadius: "var(--site-radius-pill)" }}
            >
              <PrimaryLink href="/check">Check a paper</PrimaryLink>
              <GhostLink href="/reports/1810.04805">See a finished report</GhostLink>
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
        {(progress) => (
          <Container className="flex h-full flex-col items-center justify-center gap-5 pt-20 text-center">
            <Tag dot>Built for conference and workshop submissions</Tag>

            <Exit progress={progress} from={0.7} to={0.82} className="w-full">
              <Spine progress={progress} />
            </Exit>

            <h1 className="site-h1 mx-auto max-w-[1000px] text-balance">
              A verification layer for papers under submission
            </h1>

            {/* One box with two occupants. The verdict leaves as the copy arrives,
                so the frame never has to be tall enough to hold both at once. */}
            <div className="relative h-[190px] w-full">
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
                  <p className="site-body mx-auto max-w-[560px] text-balance">
                    residual checks whether the numbers a paper states agree with each other. An
                    author runs it before submitting and attaches the report. A reviewer or chair
                    reads it instead of redoing the arithmetic by hand.
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
                    <GhostLink href="/reports/1810.04805">See a finished report</GhostLink>
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
