"use client";

import { useState } from "react";

import type { CheckResult, Finding, RunReport } from "@/types/run-report";
import { REASON, VERDICT_LABEL, reasonLabel } from "@/lib/verdict";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { SiglumMark } from "@/components/gutter/siglum-mark";
import { siglaFor } from "@/components/gutter/sigla";

/**
 * The verdict pane (§4): dark, dense, mono. The other half of §2's two
 * materials — the instrument reading the document.
 *
 * With nothing selected it shows the "not checked" list rather than an empty
 * frame. That is deliberate: §5.5 makes that section first-class and above the
 * fold, and across the real fixtures it is the largest thing in the report.
 * Honest incompleteness is the product, so the resting state of this pane is the
 * list of what the checker declined to call — not a prompt to go find something
 * more interesting.
 */

/** Display-only: ASCII hyphen → real minus, so signed columns align in mono. */
function typesetNumber(value: string): string {
  return value.replace(/^-/, "−");
}

function ComparisonBlock({ finding }: { finding: Finding }) {
  const rows: [string, string][] = [];
  if (finding.claimed != null) rows.push(["claimed", typesetNumber(finding.claimed)]);
  if (finding.computed != null) rows.push(["computed", typesetNumber(finding.computed)]);
  if (finding.delta != null) rows.push(["delta", typesetNumber(finding.delta)]);
  if (finding.anchor.human_locator) rows.push(["source", finding.anchor.human_locator]);
  if (rows.length === 0) return null;

  return (
    <dl
      className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-1 border px-3 py-2.5"
      style={{
        borderRadius: "var(--radius-panel)",
        borderColor: "var(--chrome-line)",
        background: "var(--chrome-base)",
      }}
    >
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="t-num" style={{ color: "var(--chrome-faint)" }}>
            {key}
          </dt>
          <dd className="t-num break-words" style={{ color: "var(--chrome-text)" }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReportControl() {
  const [sent, setSent] = useState(false);

  // §5.4: always present, always one click. There is no endpoint behind it yet,
  // so it says so rather than pretending to have sent something.
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setSent(true)}
        disabled={sent}
        className="border px-3 py-2 t-body transition-colors"
        style={{
          borderRadius: "var(--radius-control)",
          borderColor: "var(--chrome-line)",
          color: sent ? "var(--chrome-faint)" : "var(--chrome-dim)",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        Report this as incorrect
      </button>
      {sent && (
        <p className="mt-2 t-body" style={{ color: "var(--chrome-faint)" }}>
          Noted locally. Reports start reaching us when the API lands.
        </p>
      )}
    </div>
  );
}

function FindingBlock({ finding, siglum }: { finding: Finding; siglum: string }) {
  return (
    <li className="border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: "var(--chrome-line)" }}>
      {/* The same mark this finding carries in the report's ledger, gutter and
          document pane. A finding that were cited one way here and another way
          there would make the mark useless, which is the only way to get a
          siglum wrong. */}
      <SiglumMark siglum={siglum} size={12} className="mb-1 block" />
      {finding.explanation && (
        // §5.4 sets the claim in serif — it is the paper speaking, not the instrument.
        <p
          className="text-[15px] leading-[1.55]"
          style={{ fontFamily: "var(--font-doc), serif", color: "var(--chrome-text)" }}
        >
          {finding.explanation}
        </p>
      )}
      <ComparisonBlock finding={finding} />
      <p className="mt-2 t-num" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
        {finding.anchor.dom_id}
      </p>
    </li>
  );
}

function CheckDetail({
  report,
  check,
  onClose,
}: {
  report: RunReport;
  check: CheckResult;
  onClose: () => void;
}) {
  const findings = check.findings ?? [];
  const reason = check.reason ? REASON[check.reason] : null;
  // Indexed over the whole report, not over this check, because that is what a
  // siglum means: one mark per claim in one report, wherever it is shown.
  const sigla = siglaFor(report);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <VerdictChip key={check.checker} verdict={check.verdict} />
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 t-body"
          style={{
            borderRadius: "var(--radius-control)",
            color: "var(--chrome-dim)",
            fontSize: "12px",
          }}
        >
          Close
          <kbd className="ml-1.5 t-num" style={{ fontSize: "11px" }}>
            esc
          </kbd>
        </button>
      </div>

      <h2 className="mt-4 t-h3" style={{ color: "var(--chrome-text)" }}>
        {check.display_name || check.checker}
      </h2>
      {check.description && (
        <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
          {check.description}
        </p>
      )}

      {reason && (
        <div
          className="mt-4 border px-3 py-2.5"
          style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--chrome-line)" }}
        >
          <p className="t-emph" style={{ color: "var(--chrome-text)" }}>
            {reason.label}
          </p>
          {reason.next && (
            <p className="mt-1 t-body" style={{ color: "var(--chrome-dim)" }}>
              {reason.next}
            </p>
          )}
          {reason.retryable && (
            <button
              type="button"
              className="mt-2 border px-2.5 py-1.5 t-body"
              style={{
                borderRadius: "var(--radius-control)",
                borderColor: "var(--chrome-line)",
                color: "var(--chrome-dim)",
              }}
            >
              Retry this check
            </button>
          )}
        </div>
      )}

      {findings.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-4">
          {findings.map((f, i) => (
            <FindingBlock
              key={`${f.anchor.dom_id}-${i}`}
              finding={f}
              siglum={f.siglum || sigla.get(`${check.checker}#${i}`) || ""}
            />
          ))}
        </ul>
      ) : (
        !reason && (
          <p className="mt-5 t-body" style={{ color: "var(--chrome-dim)" }}>
            Nothing to show: this check ran over the paper and found every value it compared to be{" "}
            {VERDICT_LABEL[check.verdict]}.
          </p>
        )
      )}

      <p className="mt-5 t-num" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
        {check.checker} v{check.checker_version}
      </p>

      <ReportControl />
    </div>
  );
}

function NotCheckedList({ report }: { report: RunReport }) {
  const items = report.not_checked ?? [];
  const sigla = siglaFor(report);

  return (
    <div className="px-5 py-4">
      {/* The landing's section tag, and this is the section §5.5 makes
          first-class. An uppercase 11px label read as a field name for the list
          under it; this reads as what it is, the largest part of most reports. */}
      <h2 className="t-tag" style={{ color: "var(--chrome-text)" }}>
        Not checked
      </h2>

      {items.length === 0 ? (
        <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
          Nothing was skipped. Every claim these checks apply to was compared.
        </p>
      ) : (
        <>
          <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
            What the checker declined to call, and why. This list is part of the result, not a
            shortfall in it.
          </p>
          <ul className="mt-4 flex flex-col">
            {items.map((item, i) => {
              const reason = REASON[item.reason];
              return (
                <li
                  key={`${item.what}-${i}`}
                  className="border-t py-3 first:border-t-0 first:pt-0"
                  style={{ borderColor: "var(--chrome-line)" }}
                >
                  <div className="flex items-baseline gap-2">
                    {/* §5.5's entries are cited too. Not checked is a result, so
                        it gets a mark like any other. */}
                    <SiglumMark
                      siglum={item.siglum || sigla.get(`not-checked#${i}`) || ""}
                      size={12}
                      className="mt-[2px] w-5 self-start"
                    />
                    <span className="mt-[3px] self-start">
                      <VerdictGlyph verdict="not_attempted" size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-emph" style={{ color: "var(--chrome-text)" }}>
                        {item.what}
                      </p>
                      <p className="mt-0.5 t-body" style={{ color: "var(--chrome-dim)" }}>
                        {reason?.label ?? reasonLabel(item.reason)}
                      </p>
                      {item.detail && (
                        <p
                          className="mt-1.5 t-num break-words"
                          style={{ color: "var(--chrome-faint)", fontSize: "12px" }}
                        >
                          {item.detail}
                        </p>
                      )}
                      {/* The curated next step is a fallback, not an addition:
                          the backend's own `detail` usually already says what to
                          do, and printing both says it twice. */}
                      {!item.detail && reason?.next && (
                        <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
                          {reason.next}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-6 t-body" style={{ color: "var(--chrome-faint)" }}>
        Select a check in the rail to see its evidence.
      </p>
    </div>
  );
}

export function VerdictPane({
  report,
  check,
  onClose,
}: {
  report: RunReport;
  check: CheckResult | null;
  onClose: () => void;
}) {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: "var(--chrome-panel)" }}
      aria-label="Verdict detail"
    >
      {check ? (
        <CheckDetail report={report} check={check} onClose={onClose} />
      ) : (
        <NotCheckedList report={report} />
      )}
    </div>
  );
}
