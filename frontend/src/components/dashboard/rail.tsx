"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { ACCOUNT_ITEM, NAV_ITEMS, type NavItem } from "./nav";
import {
  AccountIcon,
  AmendmentsIcon,
  OverviewIcon,
  PinIcon,
  ReviewIcon,
  RunsIcon,
  TestsIcon,
} from "./icons";

/**
 * The rail that widens.
 *
 * Collapsed it is 64px of marks. Point at it and it grows to 236px, and the
 * names arrive *as part of that growth* — they are in the DOM the whole time and
 * simply have no room to be read. That is the difference the brief asks for: a
 * tooltip is a second surface that appears beside the rail, and this is one
 * surface that gets wider.
 *
 * Three ways it opens, and they behave differently on purpose:
 *
 *   hover / focus   transient. The rail overlays the content, because a column
 *                   that reflows the whole page every time a pointer crosses it
 *                   is a page that will not sit still.
 *   pinned          persistent. The rail takes its own column and pushes, so an
 *                   open rail never covers a row the reader is using. The button
 *                   is also the touch answer on a tablet, where there is no
 *                   hover to expand it with.
 *   reduced motion  persistent, and not a toggle. A reader who has asked for
 *                   less motion gets the rail already open, with the pin control
 *                   removed rather than shown in a state they cannot change.
 *
 * The push/overlay split is why `pinned` lives in the shell: the shell sizes the
 * column, the rail sizes itself. Hover state stays here, where nothing else
 * needs it.
 *
 * Focus opens it too. The rail is keyboard-reachable, and tabbing into a strip of
 * unlabelled marks would be the tooltip problem with none of the affordance.
 */

export const RAIL_CLOSED = 64;
export const RAIL_OPEN = 236;

/** §6: nothing animates longer than 300ms. This is `--dur-panel`. */
const OPEN_S = 0.2;
const EASE_OUT = [0, 0, 0.2, 1] as const;

const ICONS: Record<string, (props: { size?: number }) => React.ReactElement> = {
  "/dashboard": OverviewIcon,
  "/dashboard/runs": RunsIcon,
  "/dashboard/tests": TestsIcon,
  "/dashboard/review": ReviewIcon,
  "/dashboard/amendments": AmendmentsIcon,
  "/account": AccountIcon,
};

function RailRow({
  item,
  here,
  expanded,
  reduced,
}: {
  item: NavItem;
  here: boolean;
  expanded: boolean;
  reduced: boolean;
}) {
  const Icon = ICONS[item.href] ?? OverviewIcon;

  return (
    <Link
      href={item.href}
      aria-current={here ? "page" : undefined}
      title={item.hint}
      className="relative flex h-11 items-center gap-3 overflow-hidden transition-colors"
      style={{
        // 15px puts an 18px mark in the centre of the 48px the rail leaves when
        // it is closed, and the mark then never moves as the rail opens.
        paddingInline: "15px",
        borderRadius: "var(--dash-radius-row)",
        background: here ? "var(--chrome-raised)" : "transparent",
        color: here ? "var(--chrome-text)" : "var(--chrome-dim)",
        transitionDuration: "var(--dur-fast)",
      }}
    >
      <Icon size={18} />
      <motion.span
        initial={false}
        animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
        transition={{ duration: reduced ? 0 : OPEN_S, ease: EASE_OUT }}
        className="t-body whitespace-nowrap"
        style={{ fontWeight: here ? 500 : 400 }}
      >
        {item.label}
      </motion.span>
    </Link>
  );
}

export function Rail({
  pinned,
  onPinnedChange,
  reduced,
}: {
  pinned: boolean;
  onPinnedChange: (next: boolean) => void;
  reduced: boolean;
}) {
  const pathname = usePathname();
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);

  const persistent = pinned || reduced;
  const expanded = persistent || pointer || focus;

  return (
    <motion.nav
      aria-label="Dashboard"
      initial={false}
      animate={{ width: expanded ? RAIL_OPEN : RAIL_CLOSED }}
      transition={{ duration: reduced ? 0 : OPEN_S, ease: EASE_OUT }}
      onPointerEnter={(e) => {
        // Touch raises a pointerenter that never leaves, which would strand the
        // rail open over the content. Only a real pointer expands it; a finger
        // uses the pin control, and a phone gets the row of pills instead.
        if (e.pointerType === "mouse") setPointer(true);
      }}
      onPointerLeave={() => setPointer(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
      className="fixed z-30 hidden flex-col overflow-hidden border p-2 two:flex"
      style={{
        insetBlock: "var(--dash-gap)",
        insetInlineStart: "var(--dash-gap)",
        background: "var(--chrome-base)",
        borderColor: "var(--chrome-line)",
        borderRadius: "var(--dash-radius)",
      }}
    >
      {/* Wordmark. Never the accent and never a verdict colour: the brand is not
          an interactive element and it is not a status. */}
      <Link
        href="/"
        className="mb-2 flex h-11 items-center gap-3 overflow-hidden"
        style={{ paddingInline: "15px", borderRadius: "var(--dash-radius-row)" }}
      >
        <span
          className="t-num grid h-[18px] w-[18px] shrink-0 place-items-center"
          aria-hidden
          style={{
            background: "var(--chrome-raised)",
            borderRadius: "6px",
            color: "var(--chrome-text)",
            fontSize: "11px",
            lineHeight: 1,
          }}
        >
          r
        </span>
        <motion.span
          initial={false}
          animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
          transition={{ duration: reduced ? 0 : OPEN_S, ease: EASE_OUT }}
          className="t-emph whitespace-nowrap"
          style={{ color: "var(--chrome-text)" }}
        >
          residual
        </motion.span>
      </Link>

      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <RailRow
            key={item.href}
            item={item}
            here={item.match(pathname)}
            expanded={expanded}
            reduced={reduced}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Hidden under reduced motion, where the rail is already open and cannot
          be closed: a toggle that does nothing is worse than no toggle. */}
      {!reduced ? (
        <button
          type="button"
          onClick={() => onPinnedChange(!pinned)}
          aria-pressed={pinned}
          className={cn("flex h-11 items-center gap-3 overflow-hidden transition-colors")}
          style={{
            paddingInline: "15px",
            borderRadius: "var(--dash-radius-row)",
            color: "var(--chrome-faint)",
            transitionDuration: "var(--dur-fast)",
          }}
        >
          <PinIcon open={pinned} size={18} />
          <motion.span
            initial={false}
            animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
            transition={{ duration: reduced ? 0 : OPEN_S, ease: EASE_OUT }}
            className="t-body whitespace-nowrap"
          >
            {pinned ? "Let it collapse" : "Keep it open"}
          </motion.span>
        </button>
      ) : null}

      <div className="my-2 h-px shrink-0" style={{ background: "var(--rule-grid-deep)" }} />

      <RailRow
        item={ACCOUNT_ITEM}
        here={ACCOUNT_ITEM.match(pathname)}
        expanded={expanded}
        reduced={reduced}
      />
    </motion.nav>
  );
}
