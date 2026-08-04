import { dashboardRuns, formatSeconds, workspaceTotals } from "@/components/dashboard/data.server";
import { RunList } from "@/components/dashboard/runs";
import { Empty, Mono, Panel, PanelHead, ScreenHead, Stat } from "@/components/dashboard/surface";

/**
 * `/dashboard/runs` — what has run.
 *
 * `docs/DASHBOARD.md` asks for sort and a stage filter. Neither is here, and the
 * screen says why rather than shipping a control with one option in it: every
 * committed run is complete, so a stage filter would be a menu that cannot
 * change what is on screen. The sort is fixed at newest first, which is the
 * order the reports already come in.
 */

export default function RunsScreen() {
  const runs = dashboardRuns();
  const totals = workspaceTotals();

  return (
    <div className="flex flex-col gap-5">
      <ScreenHead
        title="Runs"
        lede={
          <>
            One row per committed report, newest first. The stage, the elapsed time and the verdict
            counts are the report&rsquo;s own; the row links through to the run, and the run links
            through to its public permalink.
          </>
        }
      />

      <Panel>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 two:grid-cols-4">
          <Stat label="runs" value={totals.runs} note="all complete" />
          <Stat label="checks recorded" value={totals.checksRecorded} />
          <Stat label="findings" value={totals.findings} />
          <Stat label="checker time" value={formatSeconds(totals.totalSeconds)} note="summed" />
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="p-4 pb-2 two:p-5 two:pb-2">
          <PanelHead
            title="All runs"
            note="Sorted by the finish each report recorded. No stage filter: every run here is complete, and a filter with one value in it is a control that cannot do anything."
          />
        </div>
        <div className="px-1 pb-2 two:px-2">
          <RunList runs={runs} />
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="Runs in flight"
          note="Where a queued or running row would appear."
        />
        <Empty
          title="No run is in flight"
          body={
            <>
              A run in flight has a stage that moves, and a stage that moves has to come from
              somewhere. These four are files on disk: they were complete before this screen
              existed.
            </>
          }
          needs={[
            <>
              <Mono>GET /runs</Mono> with a <Mono>state</Mono> and per-verdict counts on the list
              envelope, so N rows do not cost N report fetches
            </>,
            "the existing SSE endpoint, subscribed to per active row rather than polled",
            <>
              <Mono>DATABASE_URL</Mono>, because runs are in memory and a list that empties on
              deploy is worse than no list
            </>,
          ]}
        />
      </Panel>
    </div>
  );
}
