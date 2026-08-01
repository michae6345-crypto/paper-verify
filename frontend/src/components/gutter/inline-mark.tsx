"use client";

import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import type { Mark } from "./marks";

/**
 * The gutter's second presentation, below 760px (§4).
 *
 * There is no 48px column at that width, so the mark goes where the column would
 * have pointed: inside the cell it refers to, or beside the table's caption. It
 * is the same drawn glyph at the same weight, not a different vocabulary — a
 * reader who learns the marks on a laptop reads them unchanged on a phone.
 *
 * This is a second presentation, not a fallback: it is the only way the marks
 * exist below 760px, so it carries the same click behaviour and the same
 * accessible name as its counterpart in the column.
 */
export function InlineMark({
  mark,
  active,
  onSelect,
  className,
}: {
  mark: Mark;
  active: boolean;
  onSelect: (key: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mark.key)}
      aria-pressed={active}
      title={`${VERDICT_LABEL[mark.verdict]} — ${mark.locator}`}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] two:hidden",
        className,
      )}
      style={{
        // Paper surface: the mark sits on the document, so its only background
        // is the highlight the selection already provides.
        background: active ? "transparent" : undefined,
      }}
    >
      <VerdictGlyph verdict={mark.verdict} size={12} active={active} />
      <span className="sr-only">
        {VERDICT_LABEL[mark.verdict]} — {mark.locator}
      </span>
    </button>
  );
}
