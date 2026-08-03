import type { Metadata } from "next";

import { Measure, PageHead } from "@/components/auth/auth-shell";
import { Panel } from "@/components/auth/controls";
import { SubmitArtifacts } from "@/components/auth/submit-artifacts";
import { listReports } from "@/lib/reports";

export const metadata: Metadata = {
  title: "Submit a paper — residual",
  description:
    "Submit the paper, the repository and how it runs. residual checks the paper's LaTeX and records the rest.",
};

/**
 * Step two of the flow: the artifacts.
 *
 * The known IDs come from the committed reports, which is what this build can
 * actually check. They are passed down so the confirmation can say whether a
 * report exists rather than implying one is on its way.
 */
export default function SubmitPage() {
  const reports = listReports();

  return (
    <Measure>
      <PageHead
        eyebrow="Step two of four"
        title="Submit"
        lede="The paper, the repository, and what someone would need to run it. residual checks the paper and records the rest, then issues a verification record you can send on with them."
      />

      {/* Said once, above the fields, and again beside the fields it applies to.
          A capability boundary stated only in a footnote is stated nowhere. */}
      <Panel as="section" className="mb-6">
        <h2 className="site-h3">What happens today</h2>
        <ul className="mt-4 flex flex-col gap-3">
          <Item label="Checked">
            The paper&apos;s LaTeX source. residual resolves the macros, reads the tables, and
            reports where the numbers match, where they diverge, and where it cannot tell. Four
            checks run. In this build that happens for papers already in the corpus; submitting
            another ID issues the record and no report comes with it.
          </Item>
          <Item label="Recorded">
            The repository URL and the run instructions. They go on the record so a reviewer has
            them in one place.
          </Item>
          <Item label="Not done">
            Running anything. residual does not clone the repository, pull the image or execute the
            command, and it does not reproduce the experiments. That is not built.
          </Item>
        </ul>
      </Panel>

      <SubmitArtifacts knownIds={reports.map((r) => r.arxiv_id)} />
    </Measure>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1 two:flex-row two:gap-6">
      <span
        className="shrink-0 two:w-[7rem]"
        style={{ fontSize: "14px", fontWeight: 500, color: "var(--site-ink)" }}
      >
        {label}
      </span>
      <span className="site-body max-w-[62ch]">{children}</span>
    </li>
  );
}
