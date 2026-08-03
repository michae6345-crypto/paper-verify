import Link from "next/link";

import { appFonts } from "@/components/shell/fonts";
import { NavRail } from "@/components/shell/nav-rail";
import { SubmitForm } from "@/components/submit/submit-form";
import { GlyphStrip } from "@/components/verdict/verdict-glyph";
import { formatDate, listReports, verdictStrip } from "@/lib/reports";

/**
 * §5.1's submit screen, on the landing page's material.
 *
 * This page used to be dark chrome, which put a hard edge one click into the
 * product: the landing is light, the document pane is light, and the screen
 * between them was neither. §2's two materials are an argument about the REPORT
 * — a warm typeset artifact held against a cool instrument reading it — and
 * there is no artifact on this page to hold anything against. So it is the
 * landing: `--field-paper` for the page, white cards on it, black ink.
 *
 * §5.1 still holds inside that. One input, one line of helper text, and the
 * recently-checked list is a plain table of papers and their verdict marks. Not
 * a feature grid, not a dashboard, and no aggregate score anywhere.
 */
export default function SubmitPage() {
  const reports = listReports();

  return (
    <div className={`on-paper flex h-dvh overflow-hidden ${appFonts}`}>
      <NavRail surface="paper" />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col px-6 pt-14 pb-24 two:pt-24">
          {/* The landing's pairing: an Instrument Serif italic tag naming the
              section, then the heading in Inter at -0.06em. */}
          <p className="t-tag" style={{ color: "var(--paper-dim)" }}>
            Check a paper
          </p>
          <h1 className="mt-2 t-h1">Do the paper&apos;s own numbers agree?</h1>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-[1.6]" style={{ color: "var(--paper-dim)" }}>
            residual reads the LaTeX source, recomputes what can be recomputed, and reports
            where the numbers match, where they diverge, and where it cannot tell.
          </p>

          {/* The one control on the page, on the landing's white card. */}
          <div
            className="mt-8 p-6 two:p-8"
            style={{
              background: "var(--paper)",
              borderRadius: "var(--radius-card)",
            }}
          >
            <SubmitForm knownIds={reports.map((r) => r.arxiv_id)} />
          </div>

          <section id="recent" className="mt-16 scroll-mt-8">
            <h2 className="t-tag">Recently checked</h2>

            {reports.length === 0 ? (
              <p className="mt-3 t-body" style={{ color: "var(--paper-dim)" }}>
                No papers checked yet. Paste an arXiv ID to start.
              </p>
            ) : (
              <div
                className="mt-4 overflow-hidden"
                style={{
                  background: "var(--paper)",
                  borderRadius: "var(--radius-card)",
                }}
              >
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--rule-grid)" }}>
                      <th scope="col" className="px-6 py-3 t-label font-medium">
                        Paper
                      </th>
                      <th
                        scope="col"
                        className="hidden px-6 py-3 t-label font-medium two:table-cell"
                      >
                        Checked
                      </th>
                      <th scope="col" className="px-6 py-3 text-right t-label font-medium">
                        Verdicts
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr
                        key={report.arxiv_id}
                        className="transition-colors hover:bg-[rgba(0,0,0,0.04)]"
                        style={{
                          borderBottom: "1px solid var(--rule-grid)",
                          transitionDuration: "var(--dur-fast)",
                        }}
                      >
                        <td className="px-6 py-3.5 align-top">
                          <Link
                            href={`/runs/${report.arxiv_id}`}
                            className="block text-[15px] leading-[1.5]"
                            style={{ color: "var(--paper-ink)" }}
                          >
                            {report.title || "Untitled paper"}
                            <span
                              className="mt-0.5 block t-num"
                              style={{ color: "var(--paper-dim)", fontSize: "12px" }}
                            >
                              {report.arxiv_id}
                            </span>
                          </Link>
                        </td>
                        <td
                          className="hidden px-6 py-3.5 align-top whitespace-nowrap t-num two:table-cell"
                          style={{ color: "var(--paper-dim)", fontSize: "12px" }}
                        >
                          {formatDate(report.finished_at)}
                        </td>
                        <td className="px-6 py-3.5 text-right align-top">
                          <GlyphStrip verdicts={verdictStrip(report)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* The five marks, named, on the page where a reader first meets
                them. §12: colour is never the only signal, and a glyph nobody
                has been introduced to is not a signal at all. */}
            <p className="mt-4 t-body" style={{ color: "var(--paper-dim)" }}>
              One mark per check, in a fixed order — the same marks the report
              puts in the margin beside the paper.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
