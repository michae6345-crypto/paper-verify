/**
 * The private door: a keystroke sequence that reveals the unfinished surface.
 *
 * ---
 *
 * **This is obfuscation. It is not security, it is not authentication, and it
 * must never be called either of those.**
 *
 * The sequence is on the line below, in a file that is compiled into the client
 * bundle and shipped to every visitor. Anyone who opens devtools and reads the
 * JavaScript has it. Anyone who types `localStorage.setItem("residual.gate.v1",
 * '{"unlockedAt":""}')` into a console is through without it. Anyone who presses
 * `1`, `2`, `3` by accident is through by accident. The gated pages are still
 * built, still served, and their markup is still inside the response a locked
 * visitor receives — see `gate.tsx`, which decides what gets *painted*, not what
 * gets *sent*.
 *
 * What that buys, precisely: a casual visitor does not stumble into a
 * half-finished surface, and the public site can be shown to people without
 * explaining what `/check` is yet. That is a curtain across a doorway. It is
 * worth having and it is worth being honest about.
 *
 * What it does not buy, and the rule that follows:
 *
 * - It withholds nothing from anyone who wants it. **No key, credential, token,
 *   private record or unpublished finding may ever be placed behind this.** If a
 *   locked visitor must not be able to obtain a thing, the thing has to be
 *   withheld by a server that checked something, and there is no such server in
 *   this build.
 * - It is not a first factor, a fallback, or a component of a future login. When
 *   the real decision lands — backend auth is pending, separately, and still
 *   owed — this comes down whole. Nothing should grow to depend on it in the
 *   meantime.
 *
 * `components/auth/session.ts` makes the neighbouring admission about the fake
 * session, and for the same reason: a thing that looks like a lock while holding
 * nothing shut is exactly the sort of claim this product exists to argue with.
 */

import { STORE_EVENT, subscribeToStore } from "@/components/auth/session";

/** Versioned like the session keys, so a shape change fails closed rather than half-parsing. */
export const GATE_KEY = "residual.gate.v1";

/**
 * What the owner types. `1`, `2`, `3` as a bare sequence, or into the prompt
 * that `Enter` opens. Both readings of the request, one constant.
 */
export const GATE_SEQUENCE = "123";

/**
 * Storage throws in more situations than people expect: Safari private
 * browsing, a full quota, a locked-down profile. A curtain is not worth a blank
 * page, so every access is guarded and a failure reads as "locked".
 */
function read(): string | null {
  try {
    return window.localStorage.getItem(GATE_KEY);
  } catch {
    return null;
  }
}

function write(value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(GATE_KEY);
    else window.localStorage.setItem(GATE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * `localStorage` fires `storage` in *other* tabs only, so the tab doing the
 * writing needs its own signal. `session.ts` already owns that pair of listeners
 * and exports them; re-implementing them here is how this repository ended up
 * with two `latexutil.py` modules, so this imports instead.
 *
 * The coupling is deliberate and one-directional: the gate knows about the
 * store's event, the store knows nothing about the gate. When the fake session
 * is deleted for real auth, these two lines are what needs a new home — a shared
 * `lib/storage.ts` is the obvious one.
 */
export function subscribeToGate(onChange: () => void): () => void {
  return subscribeToStore(onChange);
}

function announce(): void {
  window.dispatchEvent(new Event(STORE_EVENT));
}

/**
 * Is the curtain open in this browser?
 *
 * Reads the store on every call rather than caching, because the caller is a
 * layout effect that runs once per mount and on every store event, not a render
 * path. `session.ts` caches by raw string because `useSyncExternalStore`
 * compares snapshots by reference and a fresh object each read would loop; a
 * boolean has no such problem.
 */
export function isGateUnlocked(): boolean {
  const raw = read();
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    return typeof (parsed as { unlockedAt?: unknown }).unlockedAt === "string";
  } catch {
    return false;
  }
}

/** Open the curtain, and tell this tab as well as the others. */
export function unlockGate(): boolean {
  const ok = write(JSON.stringify({ unlockedAt: new Date().toISOString() }));
  announce();
  return ok;
}

/** Draw it again. Offered in the prompt, and exported for any surface that wants a control. */
export function lockGate(): void {
  write(null);
  announce();
}
