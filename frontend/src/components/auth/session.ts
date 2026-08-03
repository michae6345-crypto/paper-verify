/**
 * The fake session, and the submissions it owns.
 *
 * There is no authentication in this build, deliberately. Everything here lives
 * in `localStorage` in one browser: no password, no provider, no server, no
 * check that the email belongs to whoever typed it. `NoAuthNotice` says so on
 * every screen that uses this module, and that notice is part of the contract —
 * a sign-in screen that looks real while accepting anything is exactly the kind
 * of claim this product exists to argue against.
 *
 * When real auth lands, the three storage keys below and everything that reads
 * them are what gets deleted. The shapes (`Session`, `Submission`) are close to
 * what a server would return, so the components above them should not have to
 * change much.
 */

/** Versioned so a shape change fails closed rather than half-parsing. */
export const SESSION_KEY = "residual.session.v1";
export const SUBMISSIONS_KEY = "residual.submissions.v1";

export type Session = {
  email: string;
  /** ISO 8601. Display only; nothing expires, because nothing is enforced. */
  signedInAt: string;
};

/** How the submitter says the work is run. Recorded, never executed. */
export type RuntimeKind = "image" | "command" | "unspecified";

/** How the paper itself arrived. */
export type PaperKind = "arxiv" | "upload";

export type Submission = {
  /** The verification record ID. Issued in this browser, see `newRecordId`. */
  id: string;
  /** Whoever was "signed in" when this was recorded. Not verified. */
  email: string;
  paperKind: PaperKind;
  /** Set when `paperKind` is "arxiv". */
  arxivId: string | null;
  /**
   * Set when `paperKind` is "upload". The name only — the file is never read
   * and never leaves the machine, because there is nothing to send it to.
   */
  uploadName: string | null;
  repoUrl: string;
  runtimeKind: RuntimeKind;
  /** The image reference or the command, verbatim. Empty when unspecified. */
  runtime: string;
  /** ISO 8601. */
  submittedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Storage can throw: Safari private browsing, a full quota, a locked-down
 * profile. None of that should take a page down, so every access is guarded and
 * a failure reads as "nothing stored".
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * `localStorage` fires `storage` in *other* tabs only, so the tab doing the
 * writing needs its own signal. `useSession` and `useSubmissions` subscribe to
 * both.
 */
export const STORE_EVENT = "residual:store";

function announce() {
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function subscribeToStore(onChange: () => void): () => void {
  window.addEventListener(STORE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Snapshots are compared by reference by `useSyncExternalStore`, so parsing on
 * every read would loop forever. The raw string is the cache key: same string,
 * same object.
 */
let sessionRaw: string | null = null;
let sessionValue: Session | null = null;

export function readSession(): Session | null {
  const raw = read(SESSION_KEY);
  if (raw === sessionRaw) return sessionValue;
  sessionRaw = raw;
  sessionValue = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const { email, signedInAt } = parsed as Partial<Session>;
        if (typeof email === "string" && email) {
          sessionValue = { email, signedInAt: signedInAt ?? new Date().toISOString() };
        }
      }
    } catch {
      sessionValue = null;
    }
  }
  return sessionValue;
}

export function signIn(email: string): boolean {
  const session: Session = { email: email.trim(), signedInAt: new Date().toISOString() };
  const ok = write(SESSION_KEY, JSON.stringify(session));
  announce();
  return ok;
}

export function signOut(): void {
  write(SESSION_KEY, null);
  announce();
}

/* -------------------------------------------------------------------------- */
/* Submissions                                                                 */
/* -------------------------------------------------------------------------- */

let submissionsRaw: string | null = null;
let submissionsValue: Submission[] = [];

export function readSubmissions(): Submission[] {
  const raw = read(SUBMISSIONS_KEY);
  if (raw === submissionsRaw) return submissionsValue;
  submissionsRaw = raw;
  submissionsValue = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        submissionsValue = parsed.filter(
          (s): s is Submission =>
            !!s && typeof s === "object" && typeof (s as Submission).id === "string",
        );
      }
    } catch {
      submissionsValue = [];
    }
  }
  return submissionsValue;
}

/** Newest first. `addSubmission` returns the stored record so callers can show its ID. */
export function addSubmission(submission: Submission): boolean {
  const next = [submission, ...readSubmissions()];
  const ok = write(SUBMISSIONS_KEY, JSON.stringify(next));
  announce();
  return ok;
}

export function removeSubmission(id: string): void {
  const next = readSubmissions().filter((s) => s.id !== id);
  write(SUBMISSIONS_KEY, JSON.stringify(next));
  announce();
}

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A verification record ID: `RVR-20260802-8F3A2C`.
 *
 * The date is there so a record is legible without a lookup, and the suffix is
 * six hex digits from the platform CSPRNG. It is issued *by this browser*, which
 * means it is unique enough not to collide and worth nothing as proof — no
 * server has seen it and no endpoint can confirm it. `/account` says that
 * plainly rather than letting the format imply otherwise.
 */
export function newRecordId(now: Date = new Date()): string {
  const stamp =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `RVR-${stamp}-${suffix}`;
}
