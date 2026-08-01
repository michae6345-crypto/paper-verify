"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * A windowing hook for the ledger.
 *
 * CLIP parses 20 tables and 2,666 valued cells, so a report's ledger is
 * hundreds of rows long and mounting all of them costs a visible freeze on the
 * first paint and on every selection.
 *
 * Written here rather than added as a dependency: `package.json` is
 * orchestrator-owned (OWNERSHIP.md rule 6), and the ledger needs one specific
 * thing a stock virtualiser gives grudgingly — rows whose height is not known
 * until they render, because a claim quoted verbatim wraps to two lines on one
 * paper and five on the next, and an expanded derivation is taller again.
 *
 * How it works: every item starts at its estimated height, and each rendered
 * item is measured through a single ResizeObserver. Measurements replace
 * estimates in place, so the scroll height converges as the reader moves and
 * never jumps under them for rows they have already passed.
 *
 * Positions are absolute in *content* space, not viewport space, so they do not
 * change while scrolling — which is what lets the rows carry a Framer layout
 * animation without the animation firing on every scroll frame.
 *
 * Measured heights live in state, not in a ref, and each measured element
 * carries its own index in `data-vindex`. Both are deliberate: a ref read during
 * render would be exactly the stale-value bug the React compiler's rule exists
 * to catch, and it would show up here as rows drawn at the previous report's
 * offsets.
 */

export type VirtualItem = {
  index: number;
  start: number;
};

export type VirtualWindow = {
  items: VirtualItem[];
  totalSize: number;
  /**
   * Attach to every rendered item, alongside `data-vindex={index}`. One stable
   * callback for the whole list rather than one per row.
   */
  measureRef: (el: HTMLElement | null) => void;
  /** Content-space offset of one item, measured or estimated. */
  offsetOf: (index: number) => number;
  /** Height of one item, measured or estimated. */
  sizeOf: (index: number) => number;
};

const OVERSCAN = 6;

export function useVirtualWindow({
  count,
  estimateSize,
  scrollRef,
}: {
  count: number;
  estimateSize: (index: number) => number;
  scrollRef: React.RefObject<HTMLElement | null>;
}): VirtualWindow {
  const [heights, setHeights] = useState<number[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Measurements belong to one report's rows. A different report is a different
  // ledger, and the caller keys it on `arxiv_id` so this hook starts clean —
  // carrying heights across would place the first screenful of the new rows at
  // the old report's offsets.

  const record = useCallback((el: HTMLElement) => {
    const index = Number(el.dataset.vindex);
    if (!Number.isInteger(index) || index < 0) return;
    const height = el.offsetHeight;
    if (height <= 0) return;
    setHeights((prev) => {
      if (Math.abs((prev[index] ?? -1) - height) <= 0.5) return prev;
      const next = prev.slice();
      next[index] = height;
      return next;
    });
  }, []);

  const measureRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      if (typeof ResizeObserver === "undefined") {
        record(el);
        return;
      }
      // Created on first use rather than in an effect: refs are attached before
      // effects run, so an observer built in an effect would miss the first
      // screenful of rows.
      let ro = observerRef.current;
      if (!ro) {
        ro = new ResizeObserver((entries) => {
          entries.forEach((entry) => record(entry.target as HTMLElement));
        });
        observerRef.current = ro;
      }
      ro.observe(el);
      record(el);
      return () => ro.unobserve(el);
    },
    [record],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Scroll position and viewport height. rAF-throttled, and the viewport comes
  // from a ResizeObserver rather than the window: the pane changes height when
  // the sheet opens or the split moves, without the window resizing at all.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      setScrollTop(el.scrollTop);
      setViewport(el.clientHeight);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", schedule);
      ro?.disconnect();
    };
  }, [scrollRef]);

  const offsets = useMemo(() => {
    const out = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) {
      out[i + 1] = out[i] + (heights[i] ?? estimateSize(i));
    }
    return out;
  }, [count, estimateSize, heights]);

  const items = useMemo(() => {
    if (count === 0) return [];

    // Binary search for the first item whose bottom edge is below the fold.
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= scrollTop) lo = mid + 1;
      else hi = mid;
    }
    const first = Math.max(0, lo - OVERSCAN);

    // A viewport of 0 happens on the server and on the first paint, before the
    // pane has been measured. Render a screenful anyway, so the ledger is not
    // blank in the HTML and is not empty for a reader without JavaScript.
    const bottom = scrollTop + (viewport || 900);
    let last = first;
    while (last < count - 1 && offsets[last] < bottom) last++;
    last = Math.min(count - 1, last + OVERSCAN);

    const out: VirtualItem[] = [];
    for (let i = first; i <= last; i++) out.push({ index: i, start: offsets[i] });
    return out;
  }, [count, offsets, scrollTop, viewport]);

  const offsetOf = useCallback(
    (index: number) => offsets[Math.max(0, Math.min(count, index))] ?? 0,
    [offsets, count],
  );
  const sizeOf = useCallback(
    (index: number) => heights[index] ?? estimateSize(index),
    [heights, estimateSize],
  );

  return { items, totalSize: offsets[count] ?? 0, measureRef, offsetOf, sizeOf };
}
