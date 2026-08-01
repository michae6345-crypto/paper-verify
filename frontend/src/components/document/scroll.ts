/**
 * Jump-to-anchor (§6): 300ms `easeInOut`, then the highlight fades in over 200ms
 * and holds.
 *
 * `scrollIntoView({ behavior: "smooth" })` is the obvious call and the wrong one:
 * its duration is the browser's, not ours, and on a long document it runs well
 * past §6's 300ms ceiling. So the scroll is driven here, on rAF, against the
 * `--ease-in-out` token's own curve rather than an approximation of it.
 */

/** Sampler for a CSS `cubic-bezier(x1, y1, x2, y2)`, by Newton's method. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-4) break;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

/** `--ease-in-out`, kept in step with globals.css. */
const EASE_IN_OUT = cubicBezier(0.4, 0, 0.2, 1);

export const SCROLL_MS = 300;
export const HIGHLIGHT_MS = 200;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll `container` so `target` sits a third of the way down the viewport —
 * high enough that the gutter mark beside it is nowhere near an edge, low enough
 * that the rows above it stay readable as context.
 *
 * Returns a cancel function; calling it mid-flight leaves the scroll where it is
 * rather than snapping, so a user who grabs the scrollbar wins.
 */
export function scrollToAnchor(
  container: HTMLElement,
  target: HTMLElement,
  reduced = prefersReducedMotion(),
): () => void {
  const containerBox = container.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  const offset = targetBox.top - containerBox.top + container.scrollTop;
  const restTop = Math.max(
    0,
    Math.min(
      offset - container.clientHeight / 3,
      container.scrollHeight - container.clientHeight,
    ),
  );

  // A wide table scrolls sideways inside its own box. The tenth column of BERT's
  // GLUE table is off the right edge at every realistic width, so jumping to it
  // vertically and stopping would highlight a cell the reader cannot see —
  // §5.4's highlight, applied out of frame. The lateral reveal rides the same
  // 300ms curve so it reads as one movement.
  const hbox = target.closest<HTMLElement>("[data-pv-hscroll]");
  const needsH = hbox != null && hbox.scrollWidth > hbox.clientWidth;
  const fromLeft = hbox?.scrollLeft ?? 0;
  let restLeft = fromLeft;
  if (needsH && hbox) {
    const hBoxRect = hbox.getBoundingClientRect();
    const left = targetBox.left - hBoxRect.left + fromLeft;
    restLeft = Math.max(
      0,
      Math.min(
        left - (hbox.clientWidth - targetBox.width) / 2,
        hbox.scrollWidth - hbox.clientWidth,
      ),
    );
  }

  const fromTop = container.scrollTop;
  const dTop = restTop - fromTop;
  const dLeft = restLeft - fromLeft;

  if (reduced || (Math.abs(dTop) < 1 && Math.abs(dLeft) < 1)) {
    container.scrollTop = restTop;
    if (hbox) hbox.scrollLeft = restLeft;
    return () => {};
  }

  let frame = 0;
  let cancelled = false;
  const started = performance.now();

  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - started) / SCROLL_MS);
    const eased = EASE_IN_OUT(t);
    container.scrollTop = fromTop + dTop * eased;
    if (hbox) hbox.scrollLeft = fromLeft + dLeft * eased;
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
