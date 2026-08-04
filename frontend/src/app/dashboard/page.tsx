import Link from "next/link";

import { VERDICT_COLOR, VERDICT_LABEL } from "@/lib/verdict";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import {
  VERDICT_ORDER,
  corpusFindings,
  dashboardRuns,
  formatSeconds,
  workspaceTotals,
} from "@/components/dashboard/data.server";
import { CATALOG_COUNTS } from "@/components/dashboard/catalog";
import { FindingBlock, RunList } from "@/components/dashboard/runs";
import {
  Chip,
  Empty,
  Mono,
  Panel,
  PanelHead,
  ScreenHead,
  Stat,
} from "@/components/dashboard/surface";

/**
 * The overview.
 *
 * Six panels, three of which are empty, and that ratio is the screen's argument.
 * The corpus is four runs of two checkers; a home screen that filled the other
 * three panels with an activity sparkline, a pass rate and a trend arrow would
 * be inventing every one of them.
 */

export default function DashboardOverview() {
  const totals = workspaceTotals();
  const runs = dashboardRuns();
  const findings = corpusFindings();
  const checksTotal = Math.max(1, totals.checksRecorded);

  return (
    <div className="flex flex-col gap-5">
      <ScreenHead
        title="Overview"
        lede={
          <>
            Everything below is read from the four run reports committed under{" "}
            <Mono>src/fixtures/reports</Mono>. There is no live service behind this screen yet, so
            where a panel would need one it says so instead of drawing something plausible.
          </>
        }
        aside={
          totals.lastFinished ? (
            <Chip>
              corpus recorded <span className="t-num">{totals.lastFinished.slice(0, 10)}</span>
            </Chip>
          ) : null
        }
      />

      <Panel>
        <PanelHead
          title="The corpus"
          note="Totals across every committed report. Counts, not rates: a percentage over four papers would read as a measurement of the literature."
        />
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 two:grid-cols-3 three:grid-cols-6">
          <Stat label="papers" value={totals.papers} note="real arXiv sources" />
          <Stat label="runs" value={totals.runs} note="one report each" />
          <Stat label="checks recorded" value={totals.checksRecorded} note="two checkers, four runs" />
          <Stat label="tables parsed" value={totals.tablesParsed} note="across all four" />
          <Stat label="findings" value={totals.findings} note="one, on BERT" />
          <Stat
            label="checker time"
            value={formatSeconds(totals.totalSeconds)}
            note="wall clock, summed"
          />
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="Verdicts recorded"
          note={
            <>
              Every verdict the eight recorded checks returned. Nothing in the corpus diverges, and
              a zero is shown rather than dropped, because an absent row and a zero row say
              different things.
            </>
          }
        />
        <ul className="flex flex-col gap-3">
          {VERDICT_ORDER.map((verdict) => {
            const count = totals.counts[verdict];
            const share = (count / checksTotal) * 100;
            return (
              <li key={verdict} className="flex items-center gap-3">
                <span className="flex w-[176px] shrink-0 items-center gap-2">
                  <VerdictGlyph verdict={verdict} size={12} />
                  <span className="t-body" style={{ color: "var(--chrome-text)" }}>
                    {VERDICT_LABEL[verdict]}
                  </span>
                </span>
                <span
                  className="h-1 min-w-0 flex-1 overflow-hidden"
                  style={{ background: "var(--chrome-panel)", borderRadius: "2px" }}
                >
                  <span
                    className="block h-full"
                    style={{
                      width: `${share}%`,
                      background: VERDICT_COLOR[verdict],
                      borderRadius: "2px",
                    }}
                  />
                </span>
                <span className="t-num w-8 shrink-0 text-right" style={{ color: "var(--chrome-text)" }}>
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="t-body mt-4 max-w-[76ch]" style={{ color: "var(--chrome-faint)" }}>
          One check returned <span style={{ color: "var(--chrome-dim)" }}>not checked</span>, which
          is a verdict. Separately, the four runs list{" "}
          <span className="t-num">{totals.notCheckedEntries}</span> entries naming things they
          declined to verify, each with a reason. Both are on each run.
        </p>
      </Panel>

      <Panel padded={false}>
        <div className="p-4 pb-2 two:p-5 two:pb-2">
          <PanelHead
            title="Runs"
            note="Newest first, by the finish the report recorded."
            action={
              <Link
                href="/dashboard/runs"
                className="t-body underline underline-offset-4"
                style={{ color: "var(--focus-ink)" }}
              >
                All runs
              </Link>
            }
          />
        </div>
        <div className="px-1 pb-2 two:px-2">
          <RunList runs={runs} />
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="Findings"
          note="Every finding the corpus holds. There is one."
        />
        <div className="flex flex-col gap-3">
          {findings.map((item) => (
            <FindingBlock
              key={`${item.run.arxivId}-${item.check.checker}`}
              item={item}
              href={`/dashboard/papers/${item.run.arxivId}`}
            />
          ))}
          <p className="t-body max-w-[76ch]" style={{ color: "var(--chrome-faint)" }}>
            No run in the corpus recorded a{" "}
            <span style={{ color: "var(--chrome-dim)" }}>diverges</span>. That is the expected
            shape: <Mono>fixtures/GROUND_TRUTH.md</Mono> exists so the checks can be shown to
            produce no false findings on papers that are not wrong.
          </p>
        </div>
      </Panel>

      <div className="grid gap-5 three:grid-cols-2">
        <Panel>
          <PanelHead
            title="Review queue"
            note="The gate: findings held until someone reads them, before anything publishes."
          />
          <Empty
            title="Nothing is held, because nothing can be"
            body={
              <>
                Holding is the default for a finding with no decision recorded, and a committed
                report carries no decisions at all. This queue is operable by curl today and by
                nothing else.
              </>
            }
            needs={[
              <>
                <Mono>GET /runs/&#123;id&#125;/review</Mono>, the held-finding queue
              </>,
              <>
                <Mono>POST .../review/release</Mono> and <Mono>.../suppress</Mono>, both with a
                reason string
              </>,
              "real auth, because releasing another account's held finding is the failure mode",
            ]}
          />
        </Panel>

        <Panel>
          <PanelHead
            title="Amendments"
            note="An author's contest of a finding, and what happened to it."
          />
          <Empty
            title="No contest has been filed"
            body={
              <>
                All four reports carry an empty <Mono>amendments</Mono> array. An amendment
                supersedes a finding rather than editing it, so this list would sit beside the
                findings above rather than change them.
              </>
            }
            needs={[
              <>
                <Mono>GET /runs/&#123;id&#125;/amendments</Mono> for contests received
              </>,
              <>
                <Mono>POST /runs/&#123;id&#125;/amendments</Mono> for contests filed
              </>,
              "an owner on a run, so the two lists can be told apart",
            ]}
          />
        </Panel>
      </div>

      <Panel>
        <PanelHead
          title="Run history"
          note="How the corpus changed over time."
          action={
            <Link
              href="/dashboard/tests"
              className="t-body underline underline-offset-4"
              style={{ color: "var(--focus-ink)" }}
            >
              {CATALOG_COUNTS.total} checks catalogued
            </Link>
          }
        />
        <Empty
          title="There is no history to plot"
          body={
            <>
              The first run started at <Mono>{totals.firstStarted} UTC</Mono> and the last finished
              at <Mono>{totals.lastFinished} UTC</Mono>: one batch, one afternoon. A chart of four
              points inside twenty-three seconds is a decoration, and this product does not publish
              decorations of its own numbers.
            </>
          }
          needs={[
            "runs recorded over more than one sitting, which needs DATABASE_URL",
            "a bigger evaluation corpus: fifty papers is worth more here than any chart",
          ]}
        />
      </Panel>
    </div>
  );
}
