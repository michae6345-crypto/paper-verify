import type { Verdict } from "@/types/run-report";
import { cn } from "@/lib/utils";

/* ===========================================================================
   THE MARGIN GUTTER — SEAM FOR AGENT F
   ===========================================================================

   §2 calls this the signature element: a 48px vertical strip between the
   document pane and the verdict pane, carrying verdict marks aligned to the
   exact line, table, or cell they refer to, the way a proofreader's marks sit
   in a manuscript margin. It is the primary navigation of the report, not
   decoration.

   Agent E built the column, not the marks. What exists now:

     - A real, reserved 48px column in the layout grid at `--gutter-w`. It is
       not a placeholder graphic and it does not collapse when empty; the
       document measure is already sized around it, so filling it will not
       reflow the page.
     - `position: relative` with `overflow: hidden`, so marks can be placed with
       `position: absolute; top: <px>` against this box's own coordinate space.
     - 1px rules on both edges, in `--chrome-line`, marking the seam between the
       two materials.
     - `VerdictGlyph` already accepts the `active` prop §6 asks for: a
       stroke-width change over 120ms, no colour change.

   What Agent F fills in:

     1. Render marks as `children`. One `<button>` per mark, absolutely
        positioned. Use the `GutterMark` shape below — it is the contract this
        column was sized for, and `id` is deliberately `Anchor.dom_id` so a mark,
        a document highlight, and a verdict row are all keyed by the same string.

     2. Compute `top` from the document pane, not from the gutter. The document
        pane scrolls independently; the alignment that makes this element work is
        `markTop = anchorEl.offsetTop - documentScrollTop`. Recompute on scroll
        and on resize (a ResizeObserver on the document pane, not a window
        listener — the pane resizes when the split moves without the window
        changing).

     3. Clicking a mark does the three things in §5.4 at once: scroll the
        document pane to the anchor (300ms easeInOut), set the mark active, and
        select the finding in the verdict pane.

     4. Below 760px this column is not rendered at all — `two:block` below. §4
        says gutter marks collapse into inline badges at that width, so the marks
        need a second presentation inside the verdict rows. That is a real
        requirement, not a fallback: the product must work to 390px (§12).

     5. Two marks can land on the same line. Decide the collision rule before
        drawing anything — stacking them horizontally inside 48px is the obvious
        move, and 48px holds three 12px glyphs with 4px gaps.

   =========================================================================== */

/**
 * One mark in the gutter. `id` is the `dom_id` of the `Anchor` the mark refers
 * to, so it is the same key used by the document highlight and the verdict row.
 */
export type GutterMark = {
  id: string;
  verdict: Verdict;
  /** Offset in px from the top of the gutter box, computed from the document pane. */
  top: number;
  active?: boolean;
};

export function Gutter({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      className={cn("relative hidden h-full overflow-hidden two:block", className)}
      style={{
        width: "var(--gutter-w)",
        background: "var(--chrome-base)",
        borderInlineStart: "1px solid var(--chrome-line)",
        borderInlineEnd: "1px solid var(--chrome-line)",
      }}
    >
      {children}
    </div>
  );
}
