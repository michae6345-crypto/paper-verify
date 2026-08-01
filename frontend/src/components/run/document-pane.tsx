import type { RunReport } from "@/types/run-report";

/**
 * The document pane (§4): always light, always serif, never inverts. One half of
 * §2's two materials — the paper as an artifact, held against the instrument.
 *
 * SEAM: the next wave renders the paper's actual source here, with a `dom_id` on
 * every anchorable table cell and sentence so the gutter can align marks to them
 * and §5.4 can jump and highlight. The surface, measure, and typography are
 * settled; what is missing is the content. `--paper-highlight` is already
 * defined for the §5.4 anchor highlight.
 *
 * §3 gives the paper three colours and no secondary ink, so quieter text on this
 * surface is `--paper-ink` at reduced opacity rather than a fourth colour.
 */
export function DocumentPane({ report }: { report: RunReport }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--paper)" }}>
      <article className="measure-doc mx-auto px-8 py-10 t-doc">
        {/* Same display voice as the report's paper pane: size and the serif's
            own optical-size contrast, not weight. */}
        <h1 className="text-[28px] leading-[1.2] font-normal">
          {report.title || "Untitled paper"}
        </h1>
        <p className="mt-3 t-num" style={{ color: "var(--paper-ink)", opacity: 0.55 }}>
          arXiv:{report.arxiv_id}
        </p>

        {/* Our grid, not the paper's rules. */}
        <hr className="my-8 border-0 border-t" style={{ borderColor: "var(--rule-grid)" }} />

        <div style={{ opacity: 0.72 }}>
          <p>
            The paper&apos;s source is not rendered here yet. When it is, every table cell and
            sentence a check refers to gets an anchor on this side, and the marks in the margin
            line up with it.
          </p>
          {/* Deliberately not "on the left" / "on the right": below 760px the
              panes stack and those directions stop being true. */}
          <p className="mt-4">
            The checks have already run against the source. Their results are listed in the run
            rail, and selecting one shows the evidence behind it.
          </p>
        </div>
      </article>
    </div>
  );
}
