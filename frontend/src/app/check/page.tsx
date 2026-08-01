import Link from "next/link";

import { NavRail } from "@/components/shell/nav-rail";
import { SubmitForm } from "@/components/submit/submit-form";
import { GlyphStrip } from "@/components/verdict/verdict-glyph";
import { formatDate, listReports, verdictStrip } from "@/lib/reports";

/**
 * §5.1 submit screen. Recently checked papers are a plain table — title, date,
 * verdict summary as a row of gutter glyphs. Not cards.
 */
export default function SubmitPage() {
  const reports = listReports();

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: "var(--chrome-base)" }}>
      <NavRail />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col px-6 pt-16 pb-16 two:pt-24">
          <div className="flex justify-center">
            <SubmitForm knownIds={reports.map((r) => r.arxiv_id)} />
          </div>

          <section id="recent" className="mt-16 scroll-mt-8">
            <h2 className="t-label">Recently checked</h2>

            {reports.length === 0 ? (
              <p className="mt-3 t-body" style={{ color: "var(--chrome-dim)" }}>
                No papers checked yet. Paste an arXiv ID to start.
              </p>
            ) : (
              <table className="mt-3 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--chrome-line)" }}>
                    <th scope="col" className="py-2 t-label font-medium">
                      Paper
                    </th>
                    <th scope="col" className="hidden py-2 t-label font-medium two:table-cell">
                      Checked
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right t-label font-medium">
                      Verdicts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr
                      key={report.arxiv_id}
                      className="border-b transition-colors hover:bg-[var(--chrome-panel)]"
                      style={{
                        borderColor: "var(--chrome-line)",
                        transitionDuration: "var(--dur-fast)",
                      }}
                    >
                      <td className="py-2.5 pr-4 align-top">
                        <Link
                          href={`/runs/${report.arxiv_id}`}
                          className="block rounded-[4px] t-body"
                          style={{ color: "var(--chrome-text)" }}
                        >
                          {report.title || "Untitled paper"}
                          <span
                            className="mt-0.5 block t-num"
                            style={{ color: "var(--chrome-faint)", fontSize: "12px" }}
                          >
                            {report.arxiv_id}
                          </span>
                        </Link>
                      </td>
                      <td
                        className="hidden py-2.5 pr-4 align-top whitespace-nowrap t-num two:table-cell"
                        style={{ color: "var(--chrome-dim)", fontSize: "12px" }}
                      >
                        {formatDate(report.finished_at)}
                      </td>
                      <td className="py-2.5 pl-4 text-right align-top">
                        <GlyphStrip verdicts={verdictStrip(report)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
