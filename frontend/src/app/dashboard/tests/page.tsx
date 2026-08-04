import Link from "next/link";

import { CATALOG_COUNTS, entryBySlug } from "@/components/dashboard/catalog";
import { CatalogList, CatalogSummary } from "@/components/dashboard/tests";
import { Mono, Panel, PanelHead, ScreenHead } from "@/components/dashboard/surface";

/**
 * `/dashboard/tests` — every check, grouped, with the four that run first.
 *
 * The aside is the backlog's own order and the backlog's own list of what has to
 * exist underneath. It is here rather than in a document because the question a
 * reader has on this screen is "what next", and the answer already exists.
 */

const ORDER: { step: number; slugs: string[]; text: string }[] = [
  {
    step: 1,
    slugs: ["uncited-references", "column-totals"],
    text: "A day each, no new infrastructure.",
  },
  {
    step: 2,
    slugs: ["grim", "statcheck"],
    text: "The largest capability increase per line of code in the backlog.",
  },
  {
    step: 3,
    slugs: ["anonymity"],
    text: "Forces the PDF ingest branch that the whole integrity group waits on.",
  },
  {
    step: 4,
    slugs: ["abstract-vs-table"],
    text: "Forces the claim miner that four other checks partly depend on.",
  },
  { step: 5, slugs: ["prompt-injection"], text: "Once the PDF path exists." },
  { step: 6, slugs: [], text: "OpenReview, which turns venue rules from guesses into data." },
  { step: 7, slugs: [], text: "Everything else." },
];

const UNDERNEATH = [
  {
    title: "A prose claim miner",
    body: "Find the assertion in the body and bind it to a cell. The one place a model is legitimately used, and it is used for extraction only: it proposes a binding, deterministic code verifies the arithmetic, and an unbindable claim is unverifiable.",
  },
  {
    title: "A PDF ingest branch",
    body: "Anonymity, page limits and format compliance are properties of the compiled document, not of the LaTeX. Required by every check in the integrity group.",
  },
  {
    title: "A venue policy registry",
    body: "Versioned data, per venue per year, exactly as the tolerance policy is versioned. A report must state which policy version it was checked against or it is not re-derivable.",
  },
  {
    title: "A sandbox executor",
    body: "For the rerun. A separate problem, and not solved by any of the above.",
  },
];

export default function TestsScreen() {
  return (
    <div className="flex flex-col gap-5">
      <ScreenHead
        title="Tests"
        lede={
          <>
            The <span className="t-num">{CATALOG_COUNTS.total}</span> checks this product has a
            specification for. <span className="t-num">{CATALOG_COUNTS.runs}</span> of them exist as
            code; the rest are described here exactly as far as they have been described anywhere,
            and no further. Open one for what it does, what it needs, and what it would tell you.
          </>
        }
        aside={<CatalogSummary />}
      />

      <div className="grid items-start gap-5 three:grid-cols-[minmax(0,1fr)_340px]">
        <CatalogList />

        {/* Pinned only when motion is allowed, exactly as the shell's header. */}
        <aside className="flex flex-col gap-5 three:top-24 three:motion-safe:sticky">
          <Panel>
            <PanelHead title="Suggested order" note="The backlog's own, unedited." />
            <ol className="flex flex-col gap-3">
              {ORDER.map((item) => (
                <li key={item.step} className="flex gap-3">
                  <span
                    className="t-num mt-0.5 grid h-5 w-5 shrink-0 place-items-center"
                    style={{
                      background: "var(--chrome-raised)",
                      borderRadius: "var(--dash-radius-chip)",
                      color: "var(--chrome-dim)",
                      fontSize: "11px",
                    }}
                  >
                    {item.step}
                  </span>
                  <span className="min-w-0">
                    {item.slugs.length > 0 ? (
                      <span className="t-body block" style={{ color: "var(--chrome-text)" }}>
                        {item.slugs.map((slug, i) => {
                          const entry = entryBySlug(slug);
                          if (!entry) return null;
                          return (
                            <span key={slug}>
                              {i > 0 ? <span style={{ color: "var(--chrome-faint)" }}> and </span> : null}
                              <Link
                                href={`/dashboard/tests/${entry.slug}`}
                                className="underline underline-offset-4"
                              >
                                {entry.name}
                              </Link>
                            </span>
                          );
                        })}
                      </span>
                    ) : null}
                    <span className="t-body block" style={{ color: "var(--chrome-dim)" }}>
                      {item.text}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4">
              <Mono>docs/CHECKS_BACKLOG.md</Mono>
            </p>
          </Panel>

          <Panel>
            <PanelHead
              title="What has to be built underneath"
              note="Four things that are not just another module behind the existing checker interface."
            />
            <dl className="flex flex-col gap-4">
              {UNDERNEATH.map((item) => (
                <div key={item.title}>
                  <dt className="t-emph" style={{ color: "var(--chrome-text)" }}>
                    {item.title}
                  </dt>
                  <dd className="t-body mt-1" style={{ color: "var(--chrome-dim)" }}>
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
