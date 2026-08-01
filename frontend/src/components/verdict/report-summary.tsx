"use client";

import { useMemo } from "react";

import type { RunReport, Severity } from "@/types/run-report";
import { REASON, VERDICT_LABEL, VERDICT_RANK } from "@/lib/verdict";
import { GlyphStrip, VerdictGlyph } from "@/components/verdict/verdict-glyph";
import type { Mark } from "@/components/gutter/marks";
import { cn } from "@/lib/utils";

/**
 * §5.5's report, in the rail: the paper's fingerprint, its findings grouped by
 * severity, and — first-class and above the fold — everything the checker
 * declined to call, with the specific reason for each.
 *
 * The tone here is the product. Across the ten validated papers there are zero
 * `diverges` and almost no findings at all, and that is the correct result, not a
 * thin one. So the empty findings state is a plain statement of what ran and what
 * it found, in §7's vocabulary; it is not an apology, and it does not invite the
 * reader to go looking for something more dramatic. The "not checked" list below
 * it is longer than the findings list on every real paper, and it is styled as an
 * ordinary section — no warning colour, no alert icon, no error framing.
 */

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low"];
const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High severity",
  medium: "Medium severity",
  low: "Low severity",
};

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t px-4 py-4" style={{ borderColor: "var(--chrome-line)" }}>
      <h2 className="flex items-baseline justify-between gap-2 t-label">
        <span>{title}</span>
        {count != null && (
          <span className="t-num" style={{ fontSize: "11px", color: "var(--chrome-faint)" }}>
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

function MarkRow({
  mark,
  primary,
  secondary,
  selected,
  onSelect,
}: {
  mark: Mark;
  primary: string;
  secondary?: string | null;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        id={`mark-${mark.key}`}
        onClick={() => onSelect(mark.key)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-2 rounded-[4px] px-2 py-2 text-left transition-colors",
          "-mx-2",
        )}
        style={{
          background: selected ? "var(--chrome-raised)" : "transparent",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        <span className="mt-[3px] shrink-0">
          <VerdictGlyph verdict={mark.verdict} size={12} active={selected} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block t-emph" style={{ color: "var(--chrome-text)" }}>
            {primary}
          </span>
          {secondary && (
            <span
              className="mt-0.5 block t-body break-words"
              style={{ color: "var(--chrome-dim)" }}
            >
              {secondary}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function ReportSummary({
  report,
  marks,
  selectedKey,
  onSelect,
}: {
  report: RunReport;
  marks: Mark[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const checks = useMemo(() => report.checks ?? [], [report.checks]);
  const notChecked = report.not_checked ?? [];
  const tables = (report.tables ?? []).filter((t) => !t.is_nested);

  const strip = useMemo(
    () => checks.map((c) => c.verdict).sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b]),
    [checks],
  );

  const findingMarks = useMemo(() => marks.filter((m) => m.finding != null), [marks]);
  const bySeverity = useMemo(() => {
    const out = new Map<Severity, Mark[]>();
    findingMarks.forEach((m) => {
      const sev = (m.finding?.severity ?? "medium") as Severity;
      out.set(sev, [...(out.get(sev) ?? []), m]);
    });
    return out;
  }, [findingMarks]);

  // A not-checked entry may or may not have a gutter mark: only the ones naming a
  // table do. Keyed by index so the two stay in step.
  const notCheckedMarks = useMemo(() => {
    const m = new Map<number, Mark>();
    marks.forEach((mark) => {
      const match = /^not-checked#(\d+)$/.exec(mark.key);
      if (match) m.set(Number(match[1]), mark);
    });
    return m;
  }, [marks]);

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--chrome-panel)" }}>
      <header className="px-4 pt-4 pb-4">
        <h1 className="t-panel-title" style={{ color: "var(--chrome-text)" }}>
          {report.title || "Untitled paper"}
        </h1>
        <p className="mt-1 t-num" style={{ fontSize: "12px", color: "var(--chrome-faint)" }}>
          arXiv:{report.arxiv_id}
        </p>

        {/* The fingerprint: one glyph per check, in a fixed order, so two runs of
            the same shape always look the same. */}
        <div className="mt-3 flex items-center gap-2">
          <GlyphStrip verdicts={strip} size={13} />
          <span className="t-num" style={{ fontSize: "11px", color: "var(--chrome-faint)" }}>
            {checks.length} {checks.length === 1 ? "check" : "checks"} · {tables.length}{" "}
            {tables.length === 1 ? "table" : "tables"}
          </span>
        </div>
      </header>

      <Section title="Findings" count={findingMarks.length}>
        {findingMarks.length === 0 ? (
          <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
            {checks.length === 0
              ? "No checks ran over this paper."
              : `Nothing diverged. ${checks.length === 1 ? "One check" : `${checks.length} checks`} ran over ${
                  tables.length === 1 ? "one table" : `${tables.length} tables`
                }, and every value they compared agreed with the paper's own numbers. What they could not compare is listed below.`}
          </p>
        ) : (
          SEVERITY_ORDER.filter((s) => bySeverity.has(s)).map((severity) => (
            <div key={severity} className="mt-3">
              <p className="t-num" style={{ fontSize: "11px", color: "var(--chrome-faint)" }}>
                {SEVERITY_LABEL[severity]}
              </p>
              <ul className="mt-1 flex flex-col">
                {(bySeverity.get(severity) ?? []).map((mark) => (
                  <MarkRow
                    key={mark.key}
                    mark={mark}
                    primary={`${VERDICT_LABEL[mark.verdict]} — ${mark.check.display_name || mark.check.checker}`}
                    secondary={mark.finding?.verbatim || mark.locator}
                    selected={mark.key === selectedKey}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </Section>

      <Section title="Not checked" count={notChecked.length}>
        {notChecked.length === 0 ? (
          <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
            Nothing was skipped. Every claim these checks apply to was compared.
          </p>
        ) : (
          <>
            <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
              What the checker declined to call, and why. This list is part of the result, not a
              shortfall in it.
            </p>
            <ul className="mt-3 flex flex-col">
              {notChecked.map((item, i) => {
                const mark = notCheckedMarks.get(i);
                const reason = REASON[item.reason];
                const detail = item.detail || reason?.next || null;

                if (mark) {
                  return (
                    <MarkRow
                      key={`${item.what}-${i}`}
                      mark={mark}
                      primary={item.what}
                      secondary={reason?.label ?? null}
                      selected={mark.key === selectedKey}
                      onSelect={onSelect}
                    />
                  );
                }

                // No table to point at, so no mark — it is still listed in full.
                return (
                  <li key={`${item.what}-${i}`} className="flex items-start gap-2 px-0 py-2">
                    <span className="mt-[3px] shrink-0">
                      <VerdictGlyph verdict="not_attempted" size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block t-emph" style={{ color: "var(--chrome-text)" }}>
                        {item.what}
                      </span>
                      <span className="mt-0.5 block t-body" style={{ color: "var(--chrome-dim)" }}>
                        {reason?.label ?? item.reason}
                      </span>
                      {detail && (
                        <span
                          className="mt-1 block t-num break-words"
                          style={{ fontSize: "12px", color: "var(--chrome-faint)" }}
                        >
                          {detail}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section title="Checks that ran" count={checks.length}>
        <ul className="mt-2 flex flex-col gap-2.5">
          {checks.map((check) => (
            <li key={check.checker} className="flex items-start gap-2">
              <span className="mt-[3px] shrink-0">
                <VerdictGlyph verdict={check.verdict} size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block t-emph" style={{ color: "var(--chrome-text)" }}>
                  {check.display_name || check.checker}
                </span>
                <span className="mt-0.5 block t-body" style={{ color: "var(--chrome-dim)" }}>
                  {VERDICT_LABEL[check.verdict]}
                  {check.reason ? ` — ${REASON[check.reason].label.toLowerCase()}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
