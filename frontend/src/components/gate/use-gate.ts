"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { isGateUnlocked, subscribeToGate } from "@/components/gate/gate-store";

/**
 * `useLayoutEffect` warns when React renders on the server, so alias it there.
 * The effect never runs on the server either way. Copied in shape from
 * `components/site/motion/scrub.tsx`, which needs the same alias and does not
 * export it.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Is the curtain open? `false` until the DOM exists.
 *
 * This is the same problem `useReducedMotionGate` solves in `scrub.tsx`, and it
 * is solved the same way, for the same reason. The server cannot know: there is
 * no cookie, and `localStorage` does not exist there. So every branch reads
 * `false` on the server **and on the first client render** — server and client
 * agree, and there is no hydration mismatch to recover from. A layout effect
 * then reads storage and, for an unlocked reader, sets state; React flushes that
 * re-render synchronously *before the browser paints*, so the locked surface is
 * constructed and thrown away inside one commit and the gated page is the first
 * thing painted.
 *
 * `useEffect` would be wrong here and the failure is visible: it runs after
 * paint, so the owner would see the quiet 404 for a frame on every load of every
 * gated route. That is the flash this hook exists to prevent, in the direction
 * that is easy to miss.
 *
 * The remaining window is the one Next's own guide names ("How to prevent flash
 * before hydration"): between the HTML arriving and React hydrating, the browser
 * can paint the server's markup, and a layout effect cannot reach back before
 * that. `gate.tsx` closes it with the inline script the guide prescribes.
 *
 * It subscribes rather than reading once, because unlocking happens *while a
 * gated page is open* — the whole point is that the owner types `1`, `2`, `3` at
 * the quiet 404 and the page appears under them, with no reload and no redirect.
 */
export function useGateUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const sync = () => setUnlocked(isGateUnlocked());
    sync();
    return subscribeToGate(sync);
  }, []);

  return unlocked;
}
