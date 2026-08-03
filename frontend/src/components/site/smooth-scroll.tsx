"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/**
 * Lenis, matching the reference's scroll feel.
 *
 * It is a component that renders nothing rather than a wrapper, because Lenis
 * drives `window` and wrapping the page in a scroll container would take the
 * document's own scrollbar away from it. That also keeps the real scroll
 * position real, which is what every `position: sticky` on this page and every
 * `useScroll` in `motion/scrub.tsx` resolves against — Lenis smooths the input
 * and then genuinely scrolls the window, so nothing downstream has to know it
 * is there.
 *
 * Three things make this safe to mount:
 *
 * Under `prefers-reduced-motion` it is never constructed at all, and it now
 * *keeps* not being constructed: the media query is watched rather than read
 * once, so a reader who turns the preference on mid-page gets the instance torn
 * down instead of keeping smoothed scrolling until they navigate. Smoothed
 * scrolling is the exact class of motion that preference exists to turn off, and
 * a shorter duration is not the same as not doing it.
 *
 * `anchors` is left off and anchor jumps are handled by the browser. Lenis's
 * anchor handling animates to the target, and a menu link that eases through
 * eight sections on the way to the ninth is worse than arriving.
 *
 * `allowNestedScroll` is on, and it is a bug fix rather than a preference. It
 * defaults to `false` in 1.3, which means Lenis claims every wheel event on the
 * document — including wheel events over a scroll container inside the page.
 * The mobile menu in `site-header.tsx` is exactly that: `fixed inset-0 top-20
 * overflow-y-auto`. Without this, scrolling a menu that is taller than the phone
 * scrolls the page behind it and the menu itself never moves. With it, Lenis
 * walks the composed path, finds a scrollable ancestor, and stands aside.
 *
 * `lenis/dist/lenis.css` is imported because Lenis needs it and shipping the
 * library without it is a quiet way to be wrong. It is four rules, all of them
 * scoped under classes Lenis puts on `<html>` itself, so nothing outside
 * `app/(site)` can see them: `height: auto` on the root while Lenis is running,
 * `overscroll-behavior: contain` on anything marked `data-lenis-prevent`,
 * `pointer-events: none` on iframes mid-scroll so a frame cannot swallow the
 * gesture, and the clip that `lenis.stop()` relies on.
 *
 * What was decided against: a `duration` and a `lerp` are two ways of saying the
 * same thing and Lenis takes `duration` first, so `lerp` is left at its default
 * and unused rather than set to a value that reads as meaningful and is not.
 */
export function SmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    let lenis: Lenis | null = null;
    let frame = 0;

    const raf = (time: number) => {
      lenis?.raf(time);
      frame = requestAnimationFrame(raf);
    };

    const stop = () => {
      if (!lenis) return;
      cancelAnimationFrame(frame);
      frame = 0;
      lenis.destroy();
      lenis = null;
    };

    const sync = () => {
      if (query.matches) {
        stop();
        return;
      }
      if (lenis) return;
      // `autoRaf` defaults to false in 1.3, so the loop below is the only one
      // stepping the instance. Setting it and also driving `raf` by hand would
      // advance the animation twice a frame, which reads as a scroll running at
      // double speed rather than as an error.
      lenis = new Lenis({ duration: 1.1, smoothWheel: true, allowNestedScroll: true });
      frame = requestAnimationFrame(raf);
    };

    sync();
    query.addEventListener("change", sync);

    return () => {
      query.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return null;
}
