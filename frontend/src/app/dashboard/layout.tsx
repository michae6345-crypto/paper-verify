import type { Metadata } from "next";

import { Gate } from "@/components/gate";
import { dashboardRuns } from "@/components/dashboard/data.server";
import { DashboardShell } from "@/components/dashboard/shell";

/**
 * The private dashboard.
 *
 * `Gate` is another workstream's component and it is used exactly as its own
 * documentation says to use it: outermost, above this route's chrome, one prop,
 * and the layout stays a server component because `children` passes through it
 * untouched. A locked visitor gets the quiet 404 rather than the dashboard
 * furniture with a lock drawn on it.
 *
 * Note what that does and does not buy, because this screen is the reason to be
 * clear about it: the gate decides what is *painted*, not what is *served*. The
 * pages under it are still built and still in the response. Everything on this
 * dashboard is read from fixtures that are committed to the repository in plain
 * text, so there is nothing here that the curtain is being asked to keep. The
 * moment a real run belonging to a named researcher is behind this route, the
 * curtain is not enough and `gate-store.ts` says so first.
 *
 * The one other thing this layout does not do: **it does not mount the app's
 * `NavRail`.** This surface has its own rail, and two rails on one screen is one
 * rail too many.
 *
 * The papers list is read here rather than in each page so the switcher is the
 * same in every screen under this layout, and so a page that does not care about
 * the corpus does not have to read it to render its own header.
 */

export const metadata: Metadata = {
  title: "residual dashboard",
  description: "The private surface: runs, checks, and what is not checked.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const papers = dashboardRuns().map((run) => ({
    arxivId: run.arxivId,
    shortName: run.shortName,
    title: run.title,
  }));

  return (
    <Gate>
      <DashboardShell papers={papers}>{children}</DashboardShell>
    </Gate>
  );
}
