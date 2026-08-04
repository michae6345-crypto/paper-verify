"use client";

import { useSyncExternalStore } from "react";

import { STORE_EVENT, subscribeToStore } from "@/components/auth/session";

/**
 * Demo requests, and the one browser that holds them.
 *
 * There is no endpoint behind `/demo`. A request typed into that form is written
 * to `localStorage` on the machine that typed it and goes nowhere else: no
 * email, no webhook, no row in a table, nobody notified. The form says so beside
 * the submit control, and the success state says so again in the first sentence,
 * because a demo request that answers "thanks, we'll be in touch" while sitting
 * in a browser is exactly the kind of claim this product exists to argue against.
 *
 * The shape below is close to what a server would accept, so when a real
 * endpoint lands the change is a `fetch` beside the write and a queue drain for
 * whatever was recorded before it existed. `id` is carried for that: it is the
 * idempotency key a retry would need. It is deliberately not shown to the
 * person filling the form — a reference number nobody can look up is a registry
 * implied rather than one that exists, which is the trap `record-id.tsx` names.
 *
 * `session.ts` is the model for all of this and the two are separate on purpose.
 * A demo request is not a session, does not need one, and must not be cleared
 * when somebody signs out.
 */

/** Versioned, so a shape change fails closed rather than half-parsing. */
export const DEMO_REQUESTS_KEY = "residual.demo.requests.v1";

/**
 * What the request is for. The list is the one the product is actually sold
 * against: a person with one paper, the four kinds of venue that buy this, and
 * an escape hatch. `other` is not a failure of the list — a taxonomy with no way
 * out silently rounds people into the nearest wrong box.
 */
export type DemoUseCase =
  | "personal"
  | "conference"
  | "journal"
  | "lab"
  | "symposium"
  | "other";

/** Roughly how many papers a round carries. Bands, because nobody knows exactly. */
export type DemoVolume = "under-50" | "50-250" | "250-1000" | "over-1000" | "unsure";

export type DemoRequest = {
  /** Issued in this browser. See `newRequestId`, and see the note above on why it is not displayed. */
  id: string;
  name: string;
  email: string;
  useCase: DemoUseCase;
  /** "" when not asked for, which is the case for a single paper. */
  organisation: string;
  volume: DemoVolume;
  /** "" when left blank. */
  notes: string;
  /** ISO 8601. */
  requestedAt: string;
};

export const USE_CASE_OPTIONS: ReadonlyArray<{ value: DemoUseCase; label: string }> = [
  { value: "personal", label: "Personal, or a single paper" },
  { value: "conference", label: "Conference or workshop programme committee" },
  { value: "journal", label: "Journal editorial" },
  { value: "lab", label: "Research lab or group" },
  { value: "symposium", label: "Symposium" },
  { value: "other", label: "Something else" },
];

export const VOLUME_OPTIONS: ReadonlyArray<{ value: DemoVolume; label: string }> = [
  { value: "unsure", label: "Not sure yet" },
  { value: "under-50", label: "Fewer than 50" },
  { value: "50-250", label: "50 to 250" },
  { value: "250-1000", label: "250 to 1,000" },
  { value: "over-1000", label: "More than 1,000" },
];

/**
 * A single paper has no programme committee and no submission count, so the
 * form does not ask for either. One predicate rather than the same comparison
 * written in three places, because the form, the record and the summary all
 * have to agree about it.
 */
export function asksAboutVenue(useCase: DemoUseCase | ""): boolean {
  return useCase !== "" && useCase !== "personal";
}

/**
 * `labelForUseCase` rather than `useCaseLabel`, and it is not a style
 * preference: `react-hooks/rules-of-hooks` matches on the `use` prefix, so a
 * plain function called `useCaseLabel` is a lint error the moment anything calls
 * it from a helper rather than from a component. Named this way it cannot become
 * one. `labelForVolume` follows so the pair reads as a pair.
 */
export function labelForUseCase(value: DemoUseCase): string {
  return USE_CASE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function labelForVolume(value: DemoVolume): string {
  return VOLUME_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Storage throws in more places than it looks: Safari private browsing, a full
 * quota, a locked-down profile, an embedded webview with site data off. A
 * failure here is a request that was not kept, and the form has to be able to
 * say that rather than show a confirmation over a write that did not land.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshots are compared by reference by `useSyncExternalStore`, so parsing on
 * every read would loop forever. The raw string is the cache key: same string,
 * same array. Lifted from `session.ts`, which found this the hard way.
 */
let requestsRaw: string | null = null;
let requestsValue: DemoRequest[] = [];

export function readDemoRequests(): DemoRequest[] {
  const raw = read(DEMO_REQUESTS_KEY);
  if (raw === requestsRaw) return requestsValue;
  requestsRaw = raw;
  requestsValue = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        requestsValue = parsed.filter(
          (item): item is DemoRequest =>
            !!item &&
            typeof item === "object" &&
            typeof (item as DemoRequest).id === "string" &&
            typeof (item as DemoRequest).email === "string",
        );
      }
    } catch {
      requestsValue = [];
    }
  }
  return requestsValue;
}

/**
 * Newest first. Returns whether the browser actually kept it, which the caller
 * must check — the whole point of this module is that it is the only copy.
 *
 * The announcement rides `session.ts`'s `STORE_EVENT`, which is a generic "local
 * store changed" signal rather than a session one. `localStorage` fires
 * `storage` in *other* tabs only, so the writing tab needs its own; a second
 * event channel for a second key would be the same mechanism twice.
 */
export function addDemoRequest(request: DemoRequest): boolean {
  const next = [request, ...readDemoRequests()];
  const ok = write(DEMO_REQUESTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORE_EVENT));
  return ok;
}

/**
 * `DEM-20260803-8F3A2C`. The date makes a stored record legible without a
 * lookup, and the suffix is six hex digits from the platform CSPRNG.
 *
 * Unique enough not to collide with itself and worth nothing as a reference:
 * no server has seen it. That is why the success state does not print it.
 */
export function newRequestId(now: Date = new Date()): string {
  const stamp =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `DEM-${stamp}-${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Reading it back                                                             */
/* -------------------------------------------------------------------------- */

const NO_REQUESTS: DemoRequest[] = [];

/**
 * The server snapshot is "nothing recorded", because that is the truth on the
 * server: there is no cookie, no row, and nothing to read. `useSyncExternalStore`
 * hydrates with it and re-renders with the client's, so there is no hydration
 * mismatch and no effect flipping state a frame later.
 */
export function useDemoRequests(): DemoRequest[] {
  return useSyncExternalStore(subscribeToStore, readDemoRequests, () => NO_REQUESTS);
}

/** For the "you already sent one" line. Long form, because it is prose, not a table. */
export function formatRequestedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
