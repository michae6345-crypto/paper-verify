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

   What Agent F filled in, and where it lives:

     1. `components/gutter/marks.ts` derives the marks from a `RunReport`. Not
        only from findings: the ten validated papers contain zero `diverges`, so
        a gutter built from findings alone would be empty on every real report.
        Marks also come from `not_checked` entries that name a table, and from
        each remaining table's weakest available verdict. The derivation is
        bounded so it can never synthesise `diverges` or `within tolerance` —
        those two are only ever carried by a `Finding` with its own evidence.

     2. `components/gutter/gutter-marks.tsx` positions them, as `children` of
        this box. `top` is measured from the anchor element against the mark
        layer's own rect — rect arithmetic rather than `offsetTop`, because a
        table cell's `offsetParent` is its table, not the pane — and recomputed
        on scroll and through a ResizeObserver on the document pane, per the note
        below.

     3. `app/reports/[id]/report-view.tsx` owns selection and does §5.4's three
        things at once: scroll (300ms easeInOut), activate the mark, show the
        evidence.

     4. `components/gutter/inline-mark.tsx` is the sub-760px presentation: the
        same glyph, inside the cell it refers to. Not a fallback — below 760px it
        is the only place the marks exist.

     5. Collision rule, in full, in `gutter-marks.tsx`: lanes of 18px; identical
        verdicts within a lane collapse to one glyph and a count; distinct
        verdicts never collapse and stack up to three across.

   =========================================================================== */

/**
 * One mark in the gutter. `id` is the `dom_id` of the `Anchor` the mark refers
 * to, so it is the same key used by the document highlight and the verdict row.
 *
 * Kept as the documented shape of this seam. The live implementation carries the
 * same `id`/`verdict`/`active` triple plus the check behind it, as
 * `components/gutter/marks.ts`'s `Mark`.
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
