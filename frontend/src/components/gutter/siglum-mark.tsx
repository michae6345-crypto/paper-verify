import { cn } from "@/lib/utils";

/**
 * The mark itself, drawn the same way everywhere it appears.
 *
 * DESIGN_PLAN.md's signature element, and the only ornament in the system: a
 * short mark in `--siglum` mono that cites one claim, and cites it identically in
 * the document pane, on the ledger row, in the gutter, and in the exported PDF.
 * A reader follows one claim across all four by following one mark.
 *
 * `--siglum` is the marginal ink — a warm grey against cool chrome, the way a
 * pencil note sits on a printed page. It is the one warm value in the system and
 * it is a neutral, not an accent, so it never reads as a status.
 *
 * ONE MARK, TWO INKS, exactly as the construction grid has two. §2's two
 * materials mean this component draws on both of them: `--siglum` on the dark
 * chrome of the ledger and the gutter, `--siglum-paper` on the light document
 * pane, where the dark-field value reads at 3.8:1 and would fail §12. Callers on
 * the paper pass `surface="paper"`; nothing else changes.
 *
 * Not a link and not a button. The row, the cell and the gutter glyph are each
 * already the control for their claim, and a mark that were also clickable would
 * put a third target on the same claim. It carries no accessible name of its own
 * for the same reason: every surface that draws it already names the claim in
 * full, and a screen reader announcing "a" between a verdict and a locator would
 * be reading out a visual index.
 */
export function SiglumMark({
  siglum,
  size = 12,
  surface = "chrome",
  className,
  style,
}: {
  siglum: string;
  size?: number;
  /** Which of §2's two materials this mark is sitting on. */
  surface?: "chrome" | "paper";
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!siglum) return null;
  return (
    <span
      aria-hidden
      className={cn("t-num shrink-0", className)}
      style={{
        color: surface === "paper" ? "var(--siglum-paper)" : "var(--siglum)",
        fontSize: `${size}px`,
        lineHeight: 1.2,
        letterSpacing: "0.04em",
        ...style,
      }}
    >
      {siglum}
    </span>
  );
}

/**
 * The margin slot the mark sits in on the ledger and in the document caption.
 *
 * Always the same width, mark or no mark. A derived row has no mark (see
 * `sigla.ts`) and the column has to hold its place through those rows, or the
 * apparatus stops reading as a margin and starts reading as ragged indentation.
 */
export function SiglumSlot({
  siglum,
  size,
  surface,
  className,
}: {
  siglum: string;
  size?: number;
  surface?: "chrome" | "paper";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex w-5 shrink-0 justify-start", className)}
    >
      <SiglumMark siglum={siglum} size={size} surface={surface} />
    </span>
  );
}
