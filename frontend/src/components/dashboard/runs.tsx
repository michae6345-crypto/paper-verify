import Link from "next/link";

import type { Verdict } from "@/types/run-report";
import { VERDICT_LABEL, reasonLabel } from "@/lib/verdict";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import {
  VERDICT_ORDER,
  type CorpusFinding,
  type DashboardRun,
  type VerdictCounts,
  formatMs,
  formatSeconds,
} from "./data.server";
import { ArrowIcon } from "./icons";
import { Chip, Mono, RowLink, RowList, VerdictCount } from "./surface";

/**
 * The run rows, in the deployments idiom: one line per run, state as a mark plus
 * a word, identifiers and timestamps in mono, and the whole row a single link
 * through.
 *
 * The columns are clusters rather than a fixed grid. A six-column table that
 * holds together at 1536px turns into six columns of four characters at 834px,
 * and this list has to work at 390px, where the right-hand cluster wraps under
 * the left one and nothing is lost.
 */

/**
 * The stage mark. Deliberately not a verdict colour and not the accent: §3 keeps
 * verdict colour off chrome, and a run's stage is not a judgement about a paper.
 *
 * Every committed run reads `complete`, because every committed run recorded a
 * finish. §14.2's live stages — queued, resolving, extracting, checking — belong
 * to a run in flight, and there is no run in flight to show. When `GET /runs`
 * lands with a `state` on the envelope, this is the only place that changes.
 */
function StageMark({ stage }: { stage: DashboardRun["stage"] }) {
  const label = stage === "complete" ? "complete" : "no times recorded";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
        style={{
          background: stage === "complete" ? "var(--chrome-faint)" : "transparent",
          border: stage === "complete" ? "none" : "1px solid var(--chrome-faint)",
        }}
      />
      <span className="t-body" style={{ color: "var(--chrome-dim)" }}>
        {label}
      </span>
    </span>
  );
}

/** Every verdict a run actually recorded, in §7 order. Never a percentage, never a score. */
export function VerdictCounts({ counts, size = 12 }: { counts: VerdictCounts; size?: number }) {
  const present = VERDICT_ORDER.filter((verdict) => counts[verdict] > 0);
  if (present.length === 0) {
    return (
      <span className="t-body" style={{ color: "var(--chrome-faint)" }}>
        no checks recorded
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {present.map((verdict) => (
        <VerdictCount key={verdict} verdict={verdict} count={counts[verdict]} size={size} />
      ))}
    </span>
  );
}

export function RunRow({ run, first }: { run: DashboardRun; first?: boolean }) {
  return (
    <RowLink href={`/dashboard/papers/${run.arxivId}`} first={first}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="t-emph truncate" style={{ color: "var(--chrome-text)" }} title={run.title}>
            {run.title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Mono>{run.arxivId}</Mono>
            <span aria-hidden style={{ color: "var(--chrome-line)" }}>
              &middot;
            </span>
            <Mono>{run.startedDisplay ? `${run.startedDisplay} UTC` : "no start recorded"}</Mono>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StageMark stage={run.stage} />
          <VerdictCounts counts={run.counts} />
          <span className="t-num whitespace-nowrap" style={{ color: "var(--chrome-dim)" }}>
            {formatSeconds(run.elapsedSeconds)}
          </span>
          <span aria-hidden style={{ color: "var(--chrome-faint)" }}>
            <ArrowIcon size={14} />
          </span>
        </div>
      </div>
    </RowLink>
  );
}

export function RunList({ runs }: { runs: DashboardRun[] }) {
  return (
    <RowList>
      {runs.map((run, i) => (
        <RunRow key={run.arxivId} run={run} first={i === 0} />
      ))}
    </RowList>
  );
}

/**
 * One check's recorded result: glyph, verdict word, the reason when there is one,
 * and the checker's own version and duration.
 */
export function CheckResultRow({
  run,
  checker,
  first,
}: {
  run: DashboardRun;
  checker: string;
  first?: boolean;
}) {
  const check = run.checks.find((c) => c.checker === checker);
  if (!check) return null;
  const reason = reasonLabel(check.reason);
  const findings = check.findings ?? [];

  return (
    <li
      className="px-3 py-3 two:px-4"
      style={{ borderTop: first ? "none" : "1px solid var(--chrome-line)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-[220px]">
          <p className="t-emph" style={{ color: "var(--chrome-text)" }}>
            {check.display_name || check.checker}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Mono>{check.checker}</Mono>
            <span aria-hidden style={{ color: "var(--chrome-line)" }}>
              &middot;
            </span>
            <Mono>v{check.checker_version}</Mono>
            {check.policy_version ? (
              <>
                <span aria-hidden style={{ color: "var(--chrome-line)" }}>
                  &middot;
                </span>
                <Mono>policy {check.policy_version}</Mono>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <VerdictGlyph verdict={check.verdict} size={12} />
            <span className="t-body" style={{ color: "var(--chrome-text)" }}>
              {VERDICT_LABEL[check.verdict]}
            </span>
          </span>
          {reason ? <Chip>{reason}</Chip> : null}
          {findings.length > 0 ? (
            <Chip tone="raised">
              {findings.length} {findings.length === 1 ? "finding" : "findings"}
            </Chip>
          ) : null}
          <span className="t-num whitespace-nowrap" style={{ color: "var(--chrome-faint)" }}>
            {formatMs(check.duration_ms)}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * A finding, with the comparison attached as evidence.
 *
 * The numbers are the fixture's own strings — `claimed`, `computed` and `delta`
 * are stored as text by the contract, and they are printed here exactly as
 * stored. Re-formatting them would be the lossy narrowing CLAUDE.md warns about:
 * `71.0` and `71` are different claims about precision.
 */
export function FindingBlock({ item, href }: { item: CorpusFinding; href?: string }) {
  const { run, check, finding } = item;
  const rows: [string, string | null][] = [
    ["claimed", finding.claimed ?? null],
    ["computed", finding.computed ?? null],
    ["delta", finding.delta ?? null],
    ["source", finding.anchor?.human_locator ?? null],
  ];

  return (
    <div
      className="px-4 py-4"
      style={{
        border: "1px solid var(--chrome-line)",
        borderRadius: "var(--dash-radius-row)",
        background: "var(--field-deep)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2">
          <VerdictGlyph verdict={check.verdict} size={14} />
          <span className="t-emph" style={{ color: "var(--chrome-text)" }}>
            {VERDICT_LABEL[check.verdict]}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Mono>{run.arxivId}</Mono>
          <Chip>{check.checker}</Chip>
          {finding.severity ? <Chip>severity {finding.severity}</Chip> : null}
        </span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 two:grid-cols-[88px_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="t-label self-baseline">{label}</dt>
            <dd className="t-num min-w-0 break-words" style={{ color: "var(--chrome-text)" }}>
              {/* An absence, spelled out. A dash here would be read as a value,
                  and the contract stores these as strings precisely so a missing
                  one cannot be mistaken for a zero. */}
              {value ?? "not recorded"}
            </dd>
          </div>
        ))}
      </dl>

      {finding.explanation ? (
        <p className="t-body mt-3 max-w-[74ch]" style={{ color: "var(--chrome-dim)" }}>
          {finding.explanation}
        </p>
      ) : null}

      {href ? (
        <Link
          href={href}
          className="t-body mt-3 inline-flex items-center gap-1.5 underline underline-offset-4"
          style={{ color: "var(--focus-ink)" }}
        >
          Open the run
          <ArrowIcon size={13} />
        </Link>
      ) : null}
    </div>
  );
}

/** §5.5's not-checked list: what could not be verified, and the reason, verbatim. */
export function NotCheckedList({ run }: { run: DashboardRun }) {
  return (
    <RowList>
      {run.notChecked.map((entry, i) => (
        <li
          key={`${entry.what}-${i}`}
          className="px-3 py-3 two:px-4"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--chrome-line)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <div className="min-w-0 flex-1 basis-[220px]">
              <p className="t-body" style={{ color: "var(--chrome-text)" }}>
                {entry.what}
              </p>
              {entry.detail ? (
                <p className="t-num mt-1 break-words" style={{ color: "var(--chrome-faint)" }}>
                  {entry.detail}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <VerdictGlyph verdict={"not_attempted" as Verdict} size={12} />
              <Chip>{reasonLabel(entry.reason) ?? entry.reason}</Chip>
            </div>
          </div>
        </li>
      ))}
    </RowList>
  );
}
