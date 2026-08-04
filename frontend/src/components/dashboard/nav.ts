/**
 * The rail's destinations, and the same list the phone nav renders.
 *
 * `docs/DASHBOARD.md` specifies eight rail positions: wordmark, six destinations
 * and account. Five destinations are here rather than six. `Reports` is the one
 * left out, and deliberately: the spec's argument for splitting runs from reports
 * is that a run is a process and a report is an artifact, which is right, and
 * which is exactly why a second screen cannot be built yet. Every committed run
 * is finished, so a reports library would be the same four rows under a different
 * heading. Each run row links through to its own `/reports/{id}` permalink
 * instead, and the split lands when there is a run in flight to distinguish.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Which pathnames count as this item being the current one. */
  match: (pathname: string) => boolean;
  /** One line, shown in the phone nav's overflow and as the link's title. */
  hint: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    match: (p) => p === "/dashboard",
    hint: "What the corpus holds",
  },
  {
    href: "/dashboard/runs",
    label: "Runs",
    match: (p) => p.startsWith("/dashboard/runs") || p.startsWith("/dashboard/papers"),
    hint: "Every recorded run",
  },
  {
    href: "/dashboard/tests",
    label: "Tests",
    match: (p) => p.startsWith("/dashboard/tests"),
    hint: "The checks, shipped and planned",
  },
  {
    href: "/dashboard/review",
    label: "Review",
    match: (p) => p.startsWith("/dashboard/review"),
    hint: "Held findings, before they publish",
  },
  {
    href: "/dashboard/amendments",
    label: "Amendments",
    match: (p) => p.startsWith("/dashboard/amendments"),
    hint: "Contests filed against a finding",
  },
];

export const ACCOUNT_ITEM: NavItem = {
  href: "/account",
  label: "Account",
  match: (p) => p.startsWith("/account"),
  hint: "The records this browser holds",
};
