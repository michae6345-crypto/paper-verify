"use client";

import Link from "next/link";
import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { useReducedMotionGate } from "@/components/site/motion/scrub";
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
 *
 * Its three controls share one elevation, and that is the point of them sharing
 * it: they are the only elements on the page that are over everything else rather
 * than in it, so they read as one plane of chrome instead of three pills that
 * happen to be near each other. At scroll 0 the wash behind them is fully
 * transparent and they are sitting directly on the hero, which is the case the
 * shadow is doing the most work in.
 *
 * Not the halo, which is what an element that overlaps something usually gets
 * here. Its first stop is an 8px white ring, and a white ring around the black
 * control would read as a highlight on the one control the page wants read as
 * solid. Not `.site-lift` on that control either, for all that it is the same
 * primary control as the hero's: its widest stop is a 75px blur at 24px down and
 * across, which on a 64px bar is a shadow cast onto whatever is scrolling past
 * underneath rather than onto a page that is holding still.
 */

/**
 * The menu, cut from nine entries to four.
 *
 * Nine was the whole page transcribed into a list, which is a table of contents
 * rather than a menu: every section on the page had a line whether or not anyone
 * would ever choose it, and the two entries most likely to be wanted sat at the
 * bottom. A menu earns its length by what a reader would actually go looking for,
 * and on this page that is four questions — what is it, what does it check, what
 * do I end up holding, and does a model decide any of this.
 *
 * The four that went for cause: `#roadmap` because the section is gone, and
 * `#decides`, `#apparatus` and `#measured` because they are being condensed and
 * an anchor is dead the moment its id moves. `#process` is the one judgement
 * call — it survives on the page and it is a good section, but the hero already
 * runs the five stages across the spine before a reader reaches any menu.
 *
 * **These ids are checked against the rendered page, not against this file.**
 * `app/(site)/page.tsx` composes the sections and several of them are owned by
 * other people; an id listed here that no longer exists is a link that silently
 * does nothing. Four of four resolve at the time of writing.
 */
const SECTIONS = [
  { href: "#intro", label: "What it does" },
  { href: "#checks", label: "The checks" },
  { href: "#report", label: "The report" },
  { href: "#faq", label: "Questions" },
];

/**
 * The public control, matching `hero.tsx` and the closing card. The checker
 * moved behind a gate, so the way in books a conversation rather than starting
 * a run.
 */
const CTA = { href: "/demo", label: "Book a demo" } as const;

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
  // The gate, not `motion`'s `useReducedMotion`. This picks between two `Bar`
  // trees, and the two do not agree at scroll 0: the scrubbed one starts at
  // `height: "80px"` with the wash at 0, the resting one at a numeric 64 with
  // the wash at 1. `useReducedMotion` reads false on the server and true on a
  // reduced-motion reader's first client render, so the server sends one and the
  // client wants the other, and React cannot patch the difference on that node.
  const reduced = useReducedMotionGate();

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
        className="site-elevated flex h-11 items-center px-6"
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
        {/* `prefetch={false}` for the reason `ui.tsx` sets out at length: Next
            fetches a link's route as it enters the viewport, this bar is in the
            viewport on every page of the site at all times, and a request for a
            route that does not exist yet never settles. */}
        <Link
          href={CTA.href}
          prefetch={false}
          className="site-elevated hidden h-11 items-center px-6 transition-colors two:flex"
          style={{
            background: "var(--site-ink)",
            borderRadius: "var(--site-radius-pill)",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            transitionDuration: "var(--dur-fast)",
          }}
        >
          {CTA.label}
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="site-elevated flex h-11 w-11 flex-col items-center justify-center gap-[5px]"
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

      {reduced ? (
        open && <Menu onNavigate={() => setOpen(false)} />
      ) : (
        <AnimatePresence>{open && <AnimatedMenu onNavigate={() => setOpen(false)} />}</AnimatePresence>
      )}
    </header>
  );
}

/**
 * The menu panel.
 *
 * The type went to `clamp(22px, 5.4vw, 44px)` when this held nine links, because
 * nine rows plus the control came to 798px against the 764 a 390 x 844 phone has
 * under an 80px bar, and a navigation menu that scrolls hides the entries most
 * likely to be wanted. Four rows do not have that problem: at
 * `clamp(28px, 6vw, 44px)` they come to roughly 380px, which leaves half the
 * screen empty. So the size goes back up, and each row is 68px against the 44 a
 * touch target needs.
 */
function Menu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div
      id="site-menu"
      className="pointer-events-auto fixed inset-0 top-20 z-40 overflow-y-auto"
      style={{ background: "var(--site-base)" }}
    >
      <Container>
        <nav aria-label="Sections" className="flex flex-col py-3">
          {SECTIONS.map((item) => (
            <a key={item.href} href={item.href} onClick={onNavigate} className="border-t py-4" style={MENU_LINK}>
              {item.label}
            </a>
          ))}
          <Link
            href={CTA.href}
            prefetch={false}
            onClick={onNavigate}
            className="mt-6 inline-flex h-14 items-center justify-center two:hidden"
            style={{
              background: "var(--site-ink)",
              borderRadius: "var(--site-radius-pill)",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            {CTA.label}
          </Link>
        </nav>
      </Container>
    </div>
  );
}

const MENU_LINK = {
  borderColor: "var(--site-line)",
  color: "var(--site-ink)",
  fontSize: "clamp(28px, 6vw, 44px)",
  fontWeight: 400,
  letterSpacing: "-0.04em",
  lineHeight: 1.3,
} as const;

/**
 * The same menu, arriving.
 *
 * The one piece of motion on this page that is a timeline rather than a scroll
 * position, and deliberately so: a menu opens because somebody tapped a button,
 * and driving that from scroll would be a lie about what caused it. `faq.tsx`
 * draws the same line for the same reason — the arrival of a question is
 * scrubbed, the opening of one is not.
 *
 * The field comes up first and the links follow it on a scroll-distance-free
 * stagger, because there is no scroll distance here to measure one in. 24ms
 * between links, which over four of them is 72ms — inside the 300ms §6 caps
 * everything at, and short enough that it reads as one sheet arriving with a
 * grain to it rather than as items being dealt out.
 *
 * `y: 8` and nothing else. §4 rules out sliding from far off screen, and a
 * navigation panel is the last place to make an exception: the reader has asked
 * for a list and wants to read it, not watch it.
 */
const MENU_FIELD = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const } },
  gone: { opacity: 0, transition: { duration: 0.12 } },
} as const;

const MENU_LIST = {
  hidden: {},
  shown: { transition: { delayChildren: 0.06, staggerChildren: 0.024 } },
  gone: {},
} as const;

const MENU_ITEM = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const } },
  gone: { opacity: 0, transition: { duration: 0.1 } },
} as const;

function AnimatedMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <motion.div
      id="site-menu"
      className="pointer-events-auto fixed inset-0 top-20 z-40 overflow-y-auto"
      style={{ background: "var(--site-base)", willChange: "opacity" }}
      variants={MENU_FIELD}
      initial="hidden"
      animate="shown"
      exit="gone"
    >
      <Container>
        <motion.nav
          aria-label="Sections"
          className="flex flex-col py-3"
          variants={MENU_LIST}
          initial="hidden"
          animate="shown"
          exit="gone"
        >
          {SECTIONS.map((item) => (
            <motion.a
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="border-t py-4"
              style={MENU_LINK}
              variants={MENU_ITEM}
            >
              {item.label}
            </motion.a>
          ))}
          <motion.div variants={MENU_ITEM} className="two:hidden">
            <Link
              href={CTA.href}
              prefetch={false}
              onClick={onNavigate}
              className="mt-6 inline-flex h-14 w-full items-center justify-center"
              style={{
                background: "var(--site-ink)",
                borderRadius: "var(--site-radius-pill)",
                color: "#ffffff",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              {CTA.label}
            </Link>
          </motion.div>
        </motion.nav>
      </Container>
    </motion.div>
  );
}
