"use client";

import Link from "next/link";
import { useState } from "react";

import { GhostButton, Panel } from "@/components/auth/controls";
import { RecordId } from "@/components/auth/record-id";
import { removeSubmission, type Submission } from "@/components/auth/session";
import { useIsHydrated, useSession, useSubmissions } from "@/components/auth/use-session";

/**
 * The runs this browser has recorded, each with its verification record ID and,
 * where one exists, a link to the report.
 *
 * Two things this screen has to be straight about:
 *
 * 1. A record is not proof. It was minted in this browser, no server has seen
 *    it, and no endpoint resolves it. A conference cannot check one against
 *    residual today. The format looks official enough to imply otherwise, so
 *    the page says it outright.
 * 2. Because sign-in is not authentication, the store holds every address that
 *    has been used in this browser, and one address can read another's records.
 *    Hiding that would be the same lie as the login screen. It is shown as a
 *    count with a switch, so it is visible rather than surprising.
 */

/** No `Intl` locale argument: the server and the client must agree on the string. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toISOString().slice(0, 10);
}

function runtimeLabel(submission: Submission): string {
  if (submission.runtimeKind === "image") return "Container image";
  if (submission.runtimeKind === "command") return "Command";
  return "How it runs";
}

export function AccountRecords({ titles }: { titles: Record<string, string> }) {
  const session = useSession();
  const submissions = useSubmissions();
  const hydrated = useIsHydrated();
  const [showAll, setShowAll] = useState(false);

  if (!hydrated) {
    // One frame. A skeleton would flash; an empty block of the right height does
    // not, and nothing here is worth a spinner.
    return <div className="min-h-[320px]" />;
  }

  if (!session) {
    return (
      <Panel as="section">
        <h2 className="site-h3">Sign in to see your records</h2>
        <p className="site-body mt-2 max-w-[60ch]">
          Records are listed against an email address. No password is involved and any address
          works.
        </p>
        <div className="mt-6">
          <Link
            href="/login?next=%2Faccount"
            className="site-lift inline-flex items-center px-7 py-3.5"
            style={{
              background: "var(--site-ink)",
              color: "#ffffff",
              borderRadius: "var(--site-radius-pill)",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            Sign in
          </Link>
        </div>
      </Panel>
    );
  }

  const mine = submissions.filter((s) => s.email === session.email);
  const others = submissions.length - mine.length;
  const shown = showAll ? submissions : mine;

  return (
    <div className="flex flex-col gap-6">
      <Panel as="section">
        <h2 className="site-h3">Signed in as</h2>
        <p className="site-mono mt-2" style={{ fontSize: "16px", color: "var(--site-ink)" }}>
          {session.email}
        </p>
        <p className="site-body mt-3 max-w-[62ch]">
          Asserted, not verified. Since {formatDate(session.signedInAt)}, in this browser only.
        </p>
      </Panel>

      {others > 0 && (
        <Panel as="section">
          <p className="site-body max-w-[62ch]">
            {others === 1
              ? "One record in this browser belongs to a different address."
              : `${others} records in this browser belong to different addresses.`}{" "}
            Without authentication nothing separates them, and this account can read them all.
          </p>
          <div className="mt-4">
            <GhostButton onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show only this address" : "Show every record in this browser"}
            </GhostButton>
          </div>
        </Panel>
      )}

      {shown.length === 0 ? (
        <Panel as="section">
          <h2 className="site-h3">No submissions yet</h2>
          <p className="site-body mt-2 max-w-[60ch]">
            Submit a paper and residual issues a verification record for it here.
          </p>
          <div className="mt-6">
            <Link
              href="/submit"
              className="site-lift inline-flex items-center px-7 py-3.5"
              style={{
                background: "var(--site-ink)",
                color: "#ffffff",
                borderRadius: "var(--site-radius-pill)",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              Submit a paper
            </Link>
          </div>
        </Panel>
      ) : (
        <section aria-labelledby="records-heading" className="flex flex-col gap-4">
          <h2 id="records-heading" className="site-h3">
            {shown.length === 1 ? "1 submission" : `${shown.length} submissions`}
          </h2>
          {shown.map((submission) => (
            <RecordCard
              key={submission.id}
              submission={submission}
              title={submission.arxivId ? titles[submission.arxivId] : undefined}
              foreign={submission.email !== session.email}
            />
          ))}
        </section>
      )}

      <Panel as="section">
        <h2 className="site-h3">What a verification record is</h2>
        <ul className="mt-4 flex flex-col gap-3">
          <li className="site-body max-w-[62ch]">
            It names one submission: the paper, the repository, and how the submitter says the work
            runs. Send it to the conference alongside those two things.
          </li>
          <li className="site-body max-w-[62ch]">
            It is issued in this browser. No server has seen it, no endpoint resolves it, and a
            conference cannot check one against residual today. Clearing site data deletes it.
          </li>
          <li className="site-body max-w-[62ch]">
            It carries no judgement about the paper. Where a report exists, the report is the
            finding, and it reports matches, divergences and the checks residual could not make.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function RecordCard({
  submission,
  title,
  foreign,
}: {
  submission: Submission;
  title?: string;
  foreign: boolean;
}) {
  const hasReport = !!submission.arxivId && !!title;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            style={{
              fontSize: "20px",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.4,
              color: "var(--site-ink)",
            }}
          >
            {title ?? submission.arxivId ?? submission.uploadName ?? "Untitled submission"}
          </h3>
          <p className="site-mono mt-1" style={{ fontSize: "13px", color: "var(--site-muted)" }}>
            {submission.arxivId ?? submission.uploadName} · {formatDate(submission.submittedAt)}
            {foreign ? ` · ${submission.email}` : ""}
          </p>
        </div>
        <RecordId id={submission.id} />
      </div>

      <dl className="mt-6 flex flex-col gap-3">
        <Row label="Repository">
          <a
            href={submission.repoUrl}
            className="site-mono break-all underline underline-offset-4"
            style={{ color: "var(--site-ink)" }}
            rel="noreferrer noopener"
          >
            {submission.repoUrl}
          </a>
        </Row>
        <Row label={runtimeLabel(submission)}>
          {submission.runtime ? (
            <span className="site-mono break-all whitespace-pre-wrap">{submission.runtime}</span>
          ) : (
            <span style={{ color: "var(--site-muted)" }}>Not given. Recorded either way.</span>
          )}
        </Row>
        <Row label="Report">
          {hasReport ? (
            <Link
              href={`/runs/${submission.arxivId}`}
              className="underline underline-offset-4"
              style={{ color: "var(--site-ink)" }}
            >
              Open the report for {submission.arxivId}
            </Link>
          ) : submission.arxivId ? (
            <span style={{ color: "var(--site-muted)" }}>
              None. This build checks papers already in its corpus.
            </span>
          ) : (
            <span style={{ color: "var(--site-muted)" }}>
              None. Uploads are recorded, not read. Submit the arXiv ID to have the checks run.
            </span>
          )}
        </Row>
      </dl>

      <div className="mt-6">
        <GhostButton onClick={() => removeSubmission(submission.id)}>
          Remove from this browser
        </GhostButton>
      </div>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 two:flex-row two:gap-6">
      <dt className="shrink-0 two:w-[9rem]" style={{ fontSize: "14px", color: "var(--site-muted)" }}>
        {label}
      </dt>
      <dd className="min-w-0" style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-ink)" }}>
        {children}
      </dd>
    </div>
  );
}
