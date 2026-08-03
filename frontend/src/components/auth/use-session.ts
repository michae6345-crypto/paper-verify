"use client";

import { useSyncExternalStore } from "react";

import {
  readSession,
  readSubmissions,
  subscribeToStore,
  type Session,
  type Submission,
} from "@/components/auth/session";

/**
 * `localStorage` as an external store.
 *
 * The server snapshot is deliberately "signed out with nothing stored", because
 * that is the truth on the server: there is no cookie and no session to read.
 * `useSyncExternalStore` hydrates with the server snapshot and then re-renders
 * with the client one, so there is no hydration mismatch and no need for an
 * effect that flips state a frame later.
 *
 * The consequence is one frame of signed-out UI. `useIsHydrated` exists so a
 * screen can hold a neutral state for that frame rather than flashing "you are
 * not signed in" at somebody who is.
 */

const NO_SESSION = null;
const NO_SUBMISSIONS: Submission[] = [];

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeToStore, readSession, () => NO_SESSION);
}

export function useSubmissions(): Submission[] {
  return useSyncExternalStore(subscribeToStore, readSubmissions, () => NO_SUBMISSIONS);
}

/** False on the server and for the first client render, true after hydration. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToStore,
    () => true,
    () => false,
  );
}
