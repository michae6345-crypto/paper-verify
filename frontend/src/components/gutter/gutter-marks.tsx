"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VERDICT_LABEL, VERDICT_RANK } from "@/lib/verdict";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { cn } from "@/lib/utils";
import type { Mark } from "./marks";

/**
 * The marks themselves, absolutely positioned inside the 48px column.
 *
 * ALIGNMENT. A mark's `top` comes from the document, never from the gutter: the
 * anchor element's box measured against this layer's own box. Rect arithmetic
 * rather than `offsetTop` because the anchors are table cells, whose
 * `offsetParent` is the table, not the pane. Recomputed on scroll (rAF-throttled)
 * and through a ResizeObserver on the document pane — the pane changes height
 * when the split moves or the sheet opens, without the window resizing at all,
 * so a window listener would silently drift.
 *
 * COLLISION. Every cell in one table row shares a `top`, so marks collide often
 * and predictably. Two rules, in order:
 *
 *   1. Marks within LANE_PX of each other form a lane, and a lane collapses
 *      **identical verdicts into one glyph with a count**. Five hollow circles
 *      stacked on one line carry no more information than one hollow circle and
 *      `×5`, and they carry it much less legibly. Nothing is lost, because the
 *      collapsed marks were the same mark.
 *   2. Distinct verdicts are never collapsed — that would lose the one signal the
 *      column exists to carry. They stack horizontally instead; 48px holds three
 *      glyphs. Beyond three distinct verdicts in one lane the fourth and later
 *      become a `+N` button, which selects the lane so the verdict pane can list
 *      them in full.
 *
 * Degrading to a count rather than to overlap is the point: an unreadable pile of
 * strokes would still be claiming something about the paper.
 */

const LANE_PX = 18;
const MAX_GROUPS = 3;

type Lane = {
  top: number;
  groups: { verdict: Mark["verdict"]; marks: Mark[] }[];
};

function buildLanes(marks: Mark[], tops: Map<string, number>): Lane[] {
  const placed = marks
    .map((m) => ({ mark: m, top: tops.get(m.domId) }))
    .filter((p): p is { mark: Mark; top: number } => p.top != null)
    .sort((a, b) => a.top - b.top);

  const lanes: Lane[] = [];
  let bucket: { mark: Mark; top: number }[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const byVerdict = new Map<Mark["verdict"], Mark[]>();
    bucket.forEach(({ mark }) => {
      const list = byVerdict.get(mark.verdict) ?? [];
      list.push(mark);
      byVerdict.set(mark.verdict, list);
    });
    lanes.push({
      top: bucket[0].top,
      groups: [...byVerdict.entries()]
        .map(([verdict, ms]) => ({ verdict, marks: ms }))
        .sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]),
    });
    bucket = [];
  };

  placed.forEach((p) => {
    if (bucket.length > 0 && p.top - bucket[0].top > LANE_PX) flush();
    bucket.push(p);
  });
  flush();

  return lanes;
}

export function GutterMarks({
  marks,
  selectedKey,
  scrollRef,
  onSelect,
}: {
  marks: Mark[];
  selectedKey: string | null;
  scrollRef: React.RefObject<HTMLElement | null>;
  onSelect: (key: string) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [tops, setTops] = useState<Map<string, number>>(new Map());

  const domIds = useMemo(() => [...new Set(marks.map((m) => m.domId))], [marks]);

  const measure = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const origin = layer.getBoundingClientRect().top;
    const next = new Map<string, number>();
    domIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const box = el.getBoundingClientRect();
      // Centre of the anchor, in this layer's coordinate space.
      next.set(id, box.top + box.height / 2 - origin);
    });
    setTops((prev) => {
      if (prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v)) {
        return prev;
      }
      return next;
    });
  }, [domIds]);

  useEffect(() => {
    const pane = scrollRef.current;
    const layer = layerRef.current;
    if (!pane || !layer) return;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    schedule();
    pane.addEventListener("scroll", schedule, { passive: true });

    // The pane resizes when the split moves or the sheet opens; the window does
    // not. Observe both boxes, not the window.
    const observer = new ResizeObserver(schedule);
    observer.observe(pane);
    observer.observe(layer);

    // Serif metrics shift table row heights once Source Serif 4 arrives.
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) schedule();
    });

    return () => {
      live = false;
      if (frame) cancelAnimationFrame(frame);
      pane.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [measure, scrollRef]);

  const lanes = useMemo(() => buildLanes(marks, tops), [marks, tops]);

  return (
    <div ref={layerRef} className="absolute inset-0">
      <nav aria-label="Verdict marks" className="contents">
        {lanes.map((lane) => {
          const shown = lane.groups.slice(0, MAX_GROUPS);
          const overflow = lane.groups.length - shown.length;
          const single = lane.groups.length === 1;

          return (
            <div
              key={`${lane.top}-${lane.groups[0].verdict}`}
              // No transition on `top`: this tracks scroll position, and easing a
              // position that is already being scrolled would read as lag (§6
              // forbids animating on scroll for the same reason).
              className="absolute flex items-center gap-[2px] ps-[3px]"
              style={{ top: lane.top - 10, height: 20, insetInlineStart: 0 }}
            >
              {shown.map((group) => {
                const active = group.marks.some((m) => m.key === selectedKey);
                const label =
                  group.marks.length === 1
                    ? `${VERDICT_LABEL[group.verdict]} — ${group.marks[0].locator}`
                    : `${group.marks.length} ${VERDICT_LABEL[group.verdict]} marks, from ${group.marks[0].locator}`;

                return (
                  <button
                    key={group.verdict}
                    type="button"
                    onClick={() => onSelect(group.marks[0].key)}
                    aria-pressed={active}
                    title={label}
                    className={cn(
                      "flex h-5 shrink-0 items-center justify-center rounded-[2px] transition-opacity",
                      single && group.marks.length > 1 ? "w-auto gap-[3px] px-[1px]" : "w-[13px]",
                    )}
                    style={{
                      // §6: activation is opacity plus stroke-width, 120ms.
                      opacity: active ? 1 : 0.72,
                      transitionDuration: "var(--dur-fast)",
                      transitionTimingFunction: "var(--ease-out)",
                    }}
                  >
                    <VerdictGlyph verdict={group.verdict} size={12} active={active} />
                    {single && group.marks.length > 1 && (
                      <span
                        aria-hidden
                        className="t-num"
                        style={{
                          fontSize: "10px",
                          lineHeight: 1,
                          color: "var(--chrome-faint)",
                        }}
                      >
                        {group.marks.length}
                      </span>
                    )}
                    <span className="sr-only">{label}</span>
                  </button>
                );
              })}

              {overflow > 0 && (
                <button
                  type="button"
                  onClick={() => onSelect(lane.groups[shown.length].marks[0].key)}
                  className="t-num shrink-0"
                  style={{ fontSize: "10px", lineHeight: 1, color: "var(--chrome-dim)" }}
                >
                  +{overflow}
                  <span className="sr-only"> more marks on this line</span>
                </button>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
