import Link from "next/link";

import type { RunReport } from "@/types/run-report";
import { cn } from "@/lib/utils";

/**
 * The masthead over a run, on both `/runs/[id]` and `/reports/[id]`.
 *
 * It exists because the two app views had no identity at all. The landing page
 * carries a header on every screen — a wordmark on the left, a filled control on
 * the right, floating on the page field — and opening a finished report dropped
 * all of it: a reader went from a designed site straight into two edge-to-edge
 * panes with nothing above them and no way back that was not the browser's own
 * button. The report is the thing the product makes, and it was the one screen
 * that did not look like the product.
 *
 * What it does NOT do is repeat the wordmark. `NavRail` is 56px to the left of
 * this and already carries it, so the masthead names the *document* instead:
 * this is the header for one paper, not for the site. Two wordmarks 56px apart
 * would be the seam between two designs rather than one design.
 *
 * Lives under `components/run/` because both surfaces are views of a run, and
 * one component is the point — the alternative is the same header written twice
 * and drifting, which is how this repository ended up with two `latexutil.py`.
 *
 * §3 forbids shadows in the app chrome and that holds here: the masthead has no
 * elevation. It reads as a header because of position, spacing and the filled
 * control, which is what the landing's own header is doing under its shadow.
 */
export function Masthead({
  report,
  status,
  trail,
  className,
}: {
  report: RunReport;
  /** The right-hand readout: a verdict fingerprint, or a run's elapsed time. */
  status?: React.ReactNode;
  /** A quiet link beside the arXiv id — the run from the report, or the reverse. */
  trail?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 px-3 py-3 three:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-[16rem] flex-col">
        {/* The landing's card-title step. The paper is named once, here, and the
            panes below get their vertical space back for the claims — a run with
            twelve checks has to fit a 900px viewport (§3). */}
        <h1 className="truncate t-h3" style={{ color: "var(--chrome-text)" }}>
          {report.title || "Untitled paper"}
        </h1>
        <p className="flex flex-wrap items-baseline gap-x-2.5 t-num" style={{ fontSize: "12px" }}>
          <span style={{ color: "var(--chrome-faint)" }}>arXiv:{report.arxiv_id}</span>
          {trail}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {status}
        {/* The landing's primary control, on the dark chrome. `--control-fill` is
            already defined as "a solid block of maximum contrast against its
            field", which inverts to a light block here — one gesture across the
            two surfaces rather than a black pill on one and a bordered box on
            the other. Not fully rounded (§3), so it takes the app's control
            radius rather than the landing's pill. */}
        <Link
          href="/check"
          className="inline-flex items-center px-4 py-2 t-emph transition-opacity"
          style={{
            background: "var(--control-fill)",
            color: "var(--control-fill-ink)",
            borderRadius: "var(--radius-control)",
            transitionDuration: "var(--dur-fast)",
          }}
        >
          Check a paper
        </Link>
      </div>
    </header>
  );
}

/**
 * The quiet link in the masthead's second line. Uses `--focus-ink` rather than
 * `--focus`: the accent at full strength is 4.18:1 on this field and this is
 * body text, so it takes the ink cut for a dark surface (globals.css).
 */
export function MastheadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="t-num" style={{ fontSize: "12px", color: "var(--focus-ink)" }}>
      {children}
    </Link>
  );
}
