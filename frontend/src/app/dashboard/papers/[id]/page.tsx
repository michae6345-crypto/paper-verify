import Link from "next/link";
import { notFound } from "next/navigation";

import { CATALOG } from "@/components/dashboard/catalog";
import {
  dashboardRun,
  dashboardRuns,
  formatSeconds,
} from "@/components/dashboard/data.server";
import {
  CheckResultRow,
  FindingBlock,
  NotCheckedList,
  VerdictCounts,
} from "@/components/dashboard/runs";
import { ArrowIcon } from "@/components/dashboard/icons";
import {
  Chip,
  Empty,
  Mono,
  Panel,
  PanelHead,
  RowList,
  ScreenHead,
  Stat,
} from "@/components/dashboard/surface";

/**
 * One run, in full.
 *
 * This is the screen the run rows link through to, and it is deliberately not a
 * second copy of `/reports/[id]`. That page is the artifact a reader opens: the
 * paper beside the verdicts, redacted, permalinked. This one is the process
 * record: which checker version produced which verdict, in how many
 * milliseconds, under which policy, with which fingerprint, and what the run
 * declined to check. The link between the two is at the top of the screen.
 */

export function generateStaticParams() {
  return dashboardRuns().map((run) => ({ id: run.arxivId }));
}

const SHIPPED = ["bold_extreme", "row_arithmetic", "dead_links", "citation_existence"];

export default async function PaperScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = dashboardRun(id);
  if (!run) notFound();

  const findings = run.checks.flatMap((check) =>
    (check.findings ?? []).map((finding) => ({ run, check, finding })),
  );
  const ran = new Set(run.checks.map((c) => c.checker));
  const absent = SHIPPED.filter((checker) => !ran.has(checker));

  return (
    <div className="flex flex-col gap-5">
      <ScreenHead
        title={run.title}
        lede={
          <>
            Recorded <Mono>{run.startedDisplay} UTC</Mono>, finished{" "}
            <Mono>{run.finishedDisplay} UTC</Mono>.
          </>
        }
        aside={
          <Link
            href={`/reports/${run.arxivId}`}
            className="t-body inline-flex items-center gap-2 border px-3 py-2 transition-colors"
            style={{
              borderColor: "var(--chrome-line)",
              borderRadius: "var(--dash-radius-row)",
              color: "var(--chrome-text)",
              transitionDuration: "var(--dur-fast)",
            }}
          >
            Public report
            <ArrowIcon size={14} />
          </Link>
        }
      />

      <Panel>
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Mono>{run.arxivId}</Mono>
          <Chip>stage {run.stage}</Chip>
          <VerdictCounts counts={run.counts} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 two:grid-cols-4">
          <Stat label="elapsed" value={formatSeconds(run.elapsedSeconds)} note="start to finish" />
          <Stat label="tables parsed" value={run.tablesParsed} />
          <Stat label="checks recorded" value={run.checks.length} />
          <Stat label="findings" value={run.findingCount} />
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="p-4 pb-2 two:p-5 two:pb-2">
          <PanelHead
            title="Checks"
            note="What ran, what it returned, and the version and policy it returned it under."
          />
        </div>
        <div className="px-1 pb-2 two:px-2">
          <RowList>
            {run.checks.map((check, i) => (
              <CheckResultRow key={check.checker} run={run} checker={check.checker} first={i === 0} />
            ))}
          </RowList>
        </div>
      </Panel>

      {absent.length > 0 ? (
        <Panel>
          <PanelHead
            title="Not run here"
            note="Shipped checkers that this report does not contain."
          />
          <div className="flex flex-col gap-3">
            <RowList>
              {absent.map((checker, i) => {
                const entry = CATALOG.find((e) => e.checker === checker);
                return (
                  <li
                    key={checker}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3 two:px-4"
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--chrome-line)" }}
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/dashboard/tests/${entry?.slug ?? ""}`}
                        className="t-body"
                        style={{ color: "var(--chrome-text)" }}
                      >
                        {entry?.name ?? checker}
                      </Link>
                      <span className="mt-1 block">
                        <Mono>{checker}</Mono>
                      </span>
                    </span>
                    <Chip>needs network access</Chip>
                  </li>
                );
              })}
            </RowList>
            <p className="t-body max-w-[76ch]" style={{ color: "var(--chrome-faint)" }}>
              This is an absence, not a verdict. The corpus was produced without network access, so
              the two checkers that reach outside the paper have no result to record here.
            </p>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHead title="Findings" note="The comparison, attached as evidence." />
        {findings.length > 0 ? (
          <div className="flex flex-col gap-3">
            {findings.map((item, i) => (
              <FindingBlock key={`${item.check.checker}-${i}`} item={item} />
            ))}
          </div>
        ) : (
          <Empty
            title="This run recorded no finding"
            body={
              <>
                Every check that ran either matched or declined to answer. A run with no findings
                is a normal outcome and the most common one in this corpus.
              </>
            }
          />
        )}
      </Panel>

      <Panel padded={false}>
        <div className="p-4 pb-2 two:p-5 two:pb-2">
          <PanelHead
            title="Not checked"
            note="What this run declined to verify, and the reason it gave. First-class, never hidden."
            action={<Chip tone="raised">{run.notChecked.length} entries</Chip>}
          />
        </div>
        {run.notChecked.length > 0 ? (
          <div className="px-1 pb-2 two:px-2">
            <NotCheckedList run={run} />
          </div>
        ) : (
          <div className="p-4 pt-0 two:p-5 two:pt-0">
            <Empty
              title="Nothing was declined"
              body="Every table parsed and every check the run planned produced a verdict."
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
