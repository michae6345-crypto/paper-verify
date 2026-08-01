"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Lenis, matching the reference's scroll feel.
 *
 * It is a component that renders nothing rather than a wrapper, because Lenis
 * drives `window` and wrapping the page in a scroll container would take the
 * document's own scrollbar away from it.
 *
 * Two things make this safe to mount:
 *
 * Under `prefers-reduced-motion` it is never constructed at all. Smoothed
 * scrolling is the exact class of motion that preference exists to turn off, and
 * a shorter duration is not the same as not doing it.
 *
 * `anchors` is left off and anchor jumps are handled by the browser. Lenis's
 * anchor handling animates to the target, and a menu link that eases through
 * eight sections on the way to the ninth is worse than arriving.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
