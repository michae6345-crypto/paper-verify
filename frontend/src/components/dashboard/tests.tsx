import Link from "next/link";

import { VERDICT_LABEL, reasonLabel } from "@/lib/verdict";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { cn } from "@/lib/utils";
import {
  CATALOG_COUNTS,
  SECTIONS,
  STATE_LABEL,
  type CatalogEntry,
  type CheckState,
  entriesInSection,
} from "./catalog";
import { formatMs, resultsForChecker } from "./data.server";
import { ArrowIcon } from "./icons";
import { Chip, Empty, Field, Mono, RowList } from "./surface";

/**
 * The tests surface: every check the product has, grouped by what it is.
 *
 * The discipline this screen exists to keep is that **four of these run and
 * thirty-one do not**, and nothing on it may blur that line. An unbuilt check
 * never gets a verdict, never gets a duration, and never gets a result row. It
 * gets a state in words, the prerequisites it is waiting on, and the document it
 * was specified in.
 */

function StateMark({ state }: { state: CheckState }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
        style={{
          background: state === "runs" ? "var(--chrome-text)" : "transparent",
          border: state === "runs" ? "none" : "1px solid var(--chrome-faint)",
          borderStyle: state === "planned" ? "dashed" : "solid",
        }}
      />
      <span
        style={{
          color: state === "runs" ? "var(--chrome-text)" : "var(--chrome-dim)",
          fontSize: "11px",
        }}
      >
        {STATE_LABEL[state]}
      </span>
    </span>
  );
}

function CatalogRow({
  entry,
  current,
  first,
  compact,
}: {
  entry: CatalogEntry;
  current: boolean;
  first: boolean;
  compact: boolean;
}) {
  return (
    <li style={{ borderTop: first ? "none" : "1px solid var(--chrome-line)" }}>
      <Link
        href={`/dashboard/tests/${entry.slug}`}
        aria-current={current ? "page" : undefined}
        className={cn(
          "block transition-colors hover:bg-[var(--chrome-panel)]",
          compact ? "px-3 py-2.5" : "px-3 py-3 two:px-4",
        )}
        style={{
          borderRadius: "var(--dash-radius-row)",
          background: current ? "var(--chrome-raised)" : "transparent",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        {compact ? (
          <div className="flex items-center justify-between gap-3">
            <span
              className="t-body min-w-0 truncate"
              style={{ color: current ? "var(--chrome-text)" : "var(--chrome-dim)" }}
            >
              {entry.name}
            </span>
            <span
              aria-hidden
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{
                background: entry.state === "runs" ? "var(--chrome-text)" : "transparent",
                border: entry.state === "runs" ? "none" : "1px solid var(--chrome-faint)",
                borderStyle: entry.state === "planned" ? "dashed" : "solid",
              }}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <div className="min-w-0 flex-1 basis-[240px]">
              <p className="t-emph" style={{ color: "var(--chrome-text)" }}>
                {entry.name}
              </p>
              <p className="t-body mt-1 max-w-[74ch]" style={{ color: "var(--chrome-dim)" }}>
                {entry.what}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StateMark state={entry.state} />
              {entry.effort ? <Chip>effort {entry.effort}</Chip> : null}
              <span aria-hidden style={{ color: "var(--chrome-faint)" }}>
                <ArrowIcon size={14} />
              </span>
            </div>
          </div>
        )}
      </Link>
    </li>
  );
}

/**
 * `compact` is the same list at sidebar width: names and state marks only. The
 * full row carries a sentence of description, which is right at 900px of column
 * and unreadable at 340.
 */
export function CatalogList({
  currentSlug,
  compact = false,
}: {
  currentSlug?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6")}>
      {SECTIONS.map((section) => {
        const entries = entriesInSection(section.id);
        return (
          <section key={section.id} aria-labelledby={`section-${section.id}`}>
            <header className={cn("px-1", compact ? "mb-1.5" : "mb-2")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2
                  id={`section-${section.id}`}
                  className={compact ? "t-label" : "t-panel-title"}
                  style={compact ? undefined : { color: "var(--chrome-text)" }}
                >
                  {section.title}
                </h2>
                {compact ? null : <Mono>{section.source}</Mono>}
              </div>
              {compact ? null : (
                <p className="t-body mt-1 max-w-[76ch]" style={{ color: "var(--chrome-dim)" }}>
                  {section.blurb}
                </p>
              )}
            </header>
            <div
              className="border"
              style={{
                borderColor: "var(--chrome-line)",
                borderRadius: "var(--dash-radius)",
                background: "var(--chrome-base)",
              }}
            >
              <RowList>
                {entries.map((entry, i) => (
                  <CatalogRow
                    key={entry.slug}
                    entry={entry}
                    current={entry.slug === currentSlug}
                    first={i === 0}
                    compact={compact}
                  />
                ))}
              </RowList>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CatalogSummary() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Chip tone="raised">
        <span className="t-num">{CATALOG_COUNTS.runs}</span> running today
      </Chip>
      <Chip>
        <span className="t-num">{CATALOG_COUNTS.specified}</span> specified, not built
      </Chip>
      <Chip>
        <span className="t-num">{CATALOG_COUNTS.planned}</span> not built
      </Chip>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

function CorpusResults({ entry }: { entry: CatalogEntry }) {
  const results = entry.checker ? resultsForChecker(entry.checker) : [];

  if (results.length === 0) {
    return (
      <Empty
        title="No committed run holds a result for this check"
        body={
          <>
            The four reports in the corpus were produced without network access, and this check
            needs it. Nothing here is a judgement about the check: it has simply never been run
            against a paper whose result was committed.
          </>
        }
        needs={[
          "a run with network access enabled, recorded to a report",
          <>
            or the live <Mono>GET /runs/&#123;id&#125;/findings</Mono> index, once the API serves
            this dashboard
          </>,
        ]}
      />
    );
  }

  return (
    <div
      className="border"
      style={{
        borderColor: "var(--chrome-line)",
        borderRadius: "var(--dash-radius-row)",
        background: "var(--field-deep)",
      }}
    >
      <RowList>
        {results.map(({ run, check }, i) => {
          const reason = reasonLabel(check.reason);
          const findings = check.findings ?? [];
          return (
            <li
              key={run.arxivId}
              className="px-3 py-3 two:px-4"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--chrome-line)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <Link
                    href={`/dashboard/papers/${run.arxivId}`}
                    className="t-body block truncate"
                    style={{ color: "var(--chrome-text)" }}
                  >
                    {run.shortName}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3">
                    <Mono>{run.arxivId}</Mono>
                    {check.fingerprint ? (
                      <Mono>
                        <span title={check.fingerprint}>{check.fingerprint.slice(0, 12)}</span>
                      </Mono>
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
        })}
      </RowList>
    </div>
  );
}

export function TestDetail({ entry }: { entry: CatalogEntry }) {
  const built = entry.state === "runs";

  return (
    <article className="flex flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StateMark state={entry.state} />
          {entry.effort ? <Chip>effort {entry.effort}</Chip> : null}
          {entry.queue ? <Chip>suggested order, step {entry.queue}</Chip> : null}
        </div>
        <h1
          className="mt-2"
          style={{
            fontSize: "clamp(22px, 2.4vw, 28px)",
            lineHeight: 1.2,
            letterSpacing: "-0.03em",
            fontWeight: 500,
            color: "var(--chrome-text)",
          }}
        >
          {entry.name}
        </h1>
        <p className="mt-2">
          <Mono>{entry.source}</Mono>
        </p>
      </header>

      <section>
        <h2 className="t-label">What it does</h2>
        <p className="t-body mt-2 max-w-[76ch]" style={{ color: "var(--chrome-text)" }}>
          {entry.what}
        </p>
      </section>

      <section className="grid gap-5 two:grid-cols-2">
        <div>
          <h2 className="t-label">What it needs</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {entry.needs.map((need) => (
              <li key={need} className="t-body flex gap-2" style={{ color: "var(--chrome-dim)" }}>
                <span aria-hidden style={{ color: "var(--chrome-faint)" }}>
                  &middot;
                </span>
                <span className="min-w-0">{need}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="t-label">What it would tell you</h2>
          <p className="t-body mt-2" style={{ color: "var(--chrome-dim)" }}>
            {entry.tells}
          </p>
        </div>
      </section>

      {entry.caution ? (
        <section
          className="px-4 py-3"
          style={{
            borderInlineStart: "2px solid var(--chrome-faint)",
            borderRadius: "var(--dash-radius-row)",
            background: "var(--field-deep)",
          }}
        >
          <h2 className="t-label">Where this one goes wrong</h2>
          <p className="t-body mt-1.5 max-w-[76ch]" style={{ color: "var(--chrome-dim)" }}>
            {entry.caution}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="t-label">In the corpus</h2>
        <div className="mt-2">
          {built ? (
            <CorpusResults entry={entry} />
          ) : (
            <Empty
              title="Not built, so there is nothing to show"
              body={
                <>
                  This check has never run, on this corpus or anywhere else. It has no version, no
                  policy and no verdict, and this screen will not give it one.
                </>
              }
              needs={entry.needs}
            />
          )}
        </div>
      </section>

      {built ? (
        <section>
          <h2 className="t-label">Runs it</h2>
          <dl className="mt-2 grid gap-4 two:grid-cols-3">
            <Field label="checker">
              <Mono>{entry.checker}</Mono>
            </Field>
            <Field label="policy keys">
              {entry.policyKeys && entry.policyKeys.length > 0 ? (
                <Mono>{entry.policyKeys.join(", ")}</Mono>
              ) : (
                <span style={{ color: "var(--chrome-dim)" }}>
                  none. This check takes no tolerance.
                </span>
              )}
            </Field>
            {/* True of all four, and stated rather than implied: checks 1, 2, 3
                and 6 call no model at all. That is the entire first release. */}
            <Field label="model calls">
              <span style={{ color: "var(--chrome-dim)" }}>none</span>
            </Field>
          </dl>
        </section>
      ) : null}
    </article>
  );
}
