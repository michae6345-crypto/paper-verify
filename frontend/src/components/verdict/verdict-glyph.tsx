import type { Verdict } from "@/types/run-report";
import { VERDICT_COLOR, VERDICT_LABEL } from "@/lib/verdict";
import { cn } from "@/lib/utils";

/**
 * The five verdict marks.
 *
 * Drawn as SVG paths, not icon-library icons and not font characters (§2), so
 * they hold their weight at 12px, scale into the 48px gutter, and read as
 * proofreader's marks rather than product iconography.
 *
 * §12 requires that colour is never the only signal, so each mark is distinct in
 * shape alone. Cover the colour and the five are still tellable apart:
 *
 *   matches           an unbroken rule
 *   within tolerance  the rule, with a shorter one beneath it — "about equal"
 *   diverges          a single diagonal stroke
 *   unverifiable      a hollow circle — the proofreader's query
 *   not checked       the rule, interrupted
 *
 * `not checked` deliberately reuses the rule and breaks it: it is the same kind
 * of outcome as the others, simply not run. It must not read as a failure (§7).
 */

type GlyphShape = { d: string }[] | { circle: true };

const SHAPES: Record<Verdict, GlyphShape> = {
  matches: [{ d: "M1.5 6 L10.5 6" }],
  within_tolerance: [{ d: "M1.5 4.25 L10.5 4.25" }, { d: "M3.5 8 L8.5 8" }],
  diverges: [{ d: "M4 9.5 L8 2.5" }],
  unverifiable: { circle: true },
  not_attempted: [{ d: "M1.5 6 L4.25 6" }, { d: "M7.75 6 L10.5 6" }],
};

export type VerdictGlyphProps = {
  verdict: Verdict;
  /** Rendered size in px. Designed at 12; holds up from 10 to 24. */
  size?: number;
  /**
   * `pending` is §5.3's not-yet-run state: the neutral mark at 40% opacity.
   * `active` is §6's gutter activation: a heavier stroke, no colour change.
   */
  pending?: boolean;
  active?: boolean;
  /** Announce the mark. Omit when adjacent text already says the verdict. */
  label?: boolean;
  className?: string;
};

export function VerdictGlyph({
  verdict,
  size = 12,
  pending = false,
  active = false,
  label = false,
  className,
}: VerdictGlyphProps) {
  const shape = pending ? SHAPES.not_attempted : SHAPES[verdict];
  const color = pending ? "var(--v-pending)" : VERDICT_COLOR[verdict];
  const strokeWidth = active ? 2.25 : 1.5;

  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={cn("shrink-0 transition-[stroke-width,opacity]", className)}
      style={{
        opacity: pending ? 0.4 : 1,
        transitionDuration: "var(--dur-fast)",
        transitionTimingFunction: "var(--ease-out)",
      }}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label ? (pending ? "pending" : VERDICT_LABEL[verdict]) : undefined}
    >
      {"circle" in shape ? (
        <circle cx="6" cy="6" r="3.25" />
      ) : (
        shape.map((part) => <path key={part.d} d={part.d} />)
      )}
    </svg>
  );
}

/**
 * A run summarised as a horizontal strip of marks — §5.1's recently-checked
 * table and §5.5's visual fingerprint of a paper. Order is fixed by
 * VERDICT_RANK so two runs of the same shape always look the same.
 */
export function GlyphStrip({
  verdicts,
  size = 12,
  className,
}: {
  verdicts: Verdict[];
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {verdicts.map((verdict, i) => (
        <VerdictGlyph key={`${verdict}-${i}`} verdict={verdict} size={size} />
      ))}
    </span>
  );
}
