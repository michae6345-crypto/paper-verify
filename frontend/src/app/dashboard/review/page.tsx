import { workspaceTotals } from "@/components/dashboard/data.server";
import { Empty, Mono, Panel, PanelHead, ScreenHead } from "@/components/dashboard/surface";

/**
 * `/review` — the gate.
 *
 * The screen `docs/DASHBOARD.md` calls the largest gap, and it is empty here,
 * because a held finding needs a decision record and a committed report has none.
 *
 * What it does carry is the four rules the screen has to enforce rather than
 * merely display. They are written down now, on the surface that will have to
 * obey them, because three of the four are refusals — things the finished screen
 * must not do — and a refusal that only exists in a document is a refusal that
 * gets implemented away by whoever builds the screen in a hurry.
 */

const RULES = [
  {
    title: "Holding is the default",
    body: "A finding with no decision recorded is held. The screen must never present no decision as a state that resolves itself by waiting.",
  },
  {
    title: "Suppress is not delete",
    body: "A suppressed finding stays in the full report and stays out of the public one. The screen says which of the two a reader is looking at, always.",
  },
  {
    title: "The reason is part of the record",
    body: "Release and suppress both write a reason string. A gate whose decisions carry no justification is a gate that will be operated carelessly.",
  },
  {
    title: "No bulk release",
    body: "One at a time. A release all button is how a queue of twelve becomes twelve unread accusations. This is a deliberate refusal to add an affordance, not an omission.",
  },
];

export default function ReviewScreen() {
  const totals = workspaceTotals();

  return (
    <div className="flex flex-col gap-5">
      <ScreenHead
        title="Review"
        lede={
          <>
            The gate: findings held until a person reads them, before anything is published about a
            named researcher. It is operable by <Mono>curl</Mono> today and by nothing else.
          </>
        }
      />

      <Panel>
        <PanelHead
          title="Held findings"
          note="One card per held finding: the paper, the locator, claimed against computed, the delta, the checker and its version, and the policy the tolerance came from."
        />
        <Empty
          title="Nothing is held"
          body={
            <>
              The corpus holds <span className="t-num">{totals.findings}</span> finding and no
              decision record of any kind. Holding is a state a run enters, and these four runs
              finished before there was anywhere to record one.
            </>
          }
          needs={[
            <>
              <Mono>GET /runs/&#123;id&#125;/review</Mono>, the held-finding queue
            </>,
            <>
              <Mono>POST /runs/&#123;id&#125;/review/release</Mono> and{" "}
              <Mono>.../suppress</Mono>, each taking a reason
            </>,
            "real auth with an ownership column on runs, because this screen on a fake session would let anyone release anyone's held finding",
          ]}
        />
      </Panel>

      <Panel>
        <PanelHead
          title="Rules this screen has to enforce"
          note="Not display. Enforce."
        />
        <ol className="flex flex-col gap-4">
          {RULES.map((rule, i) => (
            <li key={rule.title} className="flex gap-3">
              <span
                className="t-num mt-0.5 grid h-5 w-5 shrink-0 place-items-center"
                style={{
                  background: "var(--chrome-raised)",
                  borderRadius: "var(--dash-radius-chip)",
                  color: "var(--chrome-dim)",
                  fontSize: "11px",
                }}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="t-emph block" style={{ color: "var(--chrome-text)" }}>
                  {rule.title}
                </span>
                <span className="t-body block max-w-[76ch]" style={{ color: "var(--chrome-dim)" }}>
                  {rule.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
