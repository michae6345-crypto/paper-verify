import { dashboardRuns } from "@/components/dashboard/data.server";
import { Empty, Mono, Panel, PanelHead, ScreenHead } from "@/components/dashboard/surface";

/**
 * `/amendments` — contests.
 *
 * Two lists, both empty, and the emptiness is checked rather than assumed: every
 * committed report carries an `amendments` array, and every one of them has
 * length zero. The screen reads that array rather than hard-coding the number,
 * so the day a fixture gains a contest, this screen shows it.
 */

export default function AmendmentsScreen() {
  const runs = dashboardRuns();
  const filed = runs.reduce((n, run) => n + run.amendmentCount, 0);

  return (
    <div className="flex flex-col gap-5">
      <ScreenHead
        title="Amendments"
        lede={
          <>
            An amendment is an author&rsquo;s contest of one finding. It supersedes the finding
            rather than editing it: the two sit side by side and neither is struck through.
          </>
        }
      />

      <div className="grid gap-5 three:grid-cols-2">
        <Panel>
          <PanelHead
            title="Received"
            note="Contests filed against reports this account owns."
          />
          <Empty
            title={`No contest has been received (${filed} in ${runs.length} reports)`}
            body={
              <>
                Each entry would show the finding it answers, the author statement, the corrected
                value if one was given, the status, and the recheck result if it ran.
              </>
            }
            needs={[
              <>
                <Mono>GET /runs/&#123;id&#125;/amendments</Mono>
              </>,
              "an ownership column on runs, so received and filed can be told apart",
            ]}
          />
        </Panel>

        <Panel>
          <PanelHead title="Filed" note="Contests this account has filed against others." />
          <Empty
            title="No contest has been filed"
            body={
              <>
                Filing is a one-click action from a finding, and it is always present. It is not
                built on this surface yet.
              </>
            }
            needs={[
              <>
                <Mono>POST /runs/&#123;id&#125;/amendments</Mono>
              </>,
              "a signed-in identity that a report can be attributed to",
            ]}
          />
        </Panel>
      </div>

      <Panel>
        <PanelHead
          title="Why the schema keys on a fingerprint"
          note="Worth knowing before this screen is built, because it decides what a contest means."
        />
        <p className="t-body max-w-[80ch]" style={{ color: "var(--chrome-dim)" }}>
          An amendment is keyed on <Mono>finding_fingerprint</Mono> rather than on a row id, because
          a contest is against a specific judgement produced by a specific checker version under a
          specific policy. Bump either and the fingerprint changes, so the objection correctly stops
          applying to a result it was never made about.
        </p>
        <p className="t-body mt-3 max-w-[80ch]" style={{ color: "var(--chrome-dim)" }}>
          It is also the only human label this product generates for free: every contest is a
          person&rsquo;s judgement on one finding from one checker version. Nothing currently
          harvests it.
        </p>
      </Panel>
    </div>
  );
}
