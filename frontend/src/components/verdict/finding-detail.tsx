"use client";

import { useState } from "react";

import type { Finding } from "@/types/run-report";
import { REASON, VERDICT_LABEL } from "@/lib/verdict";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import type { Mark } from "@/components/gutter/marks";

/**
 * §5.4, the core screen — the evidence behind one mark, in the order the brief
 * fixes:
 *
 *   verdict chip → the claim quoted in serif → the monospace comparison block →
 *   the check's one-line description → `Report this as incorrect`
 *
 * Nothing here narrates a judgement. The chip carries one of §7's four words, the
 * comparison block carries the two numbers and their difference, and the reader
 * decides. A finding is never an error, a problem, a bug, or misconduct.
 */

/** Display-only: ASCII hyphen → real minus, so signed columns align in mono. */
function typesetNumber(value: string): string {
  return value.replace(/^-/, "−");
}

function ComparisonBlock({ finding, locator }: { finding: Finding; locator: string }) {
  const rows: [string, string][] = [];
  if (finding.claimed != null) rows.push(["claimed", typesetNumber(finding.claimed)]);
  if (finding.computed != null) rows.push(["computed", typesetNumber(finding.computed)]);
  if (finding.delta != null) rows.push(["delta", typesetNumber(finding.delta)]);
  rows.push(["source", finding.anchor.human_locator || locator]);

  return (
    <dl
      className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1 rounded-[4px] border px-3 py-2.5"
      style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-base)" }}
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

function ReportControl({ subject }: { subject: string }) {
  const [sent, setSent] = useState(false);

  // §5.4: always present, always one click. There is no endpoint behind it yet,
  // so it says so rather than pretending to have sent something.
  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--chrome-line)" }}>
      <button
        type="button"
        onClick={() => setSent(true)}
        disabled={sent}
        className="rounded-[4px] border px-2.5 py-1.5 t-body transition-colors"
        style={{
          borderColor: "var(--chrome-line)",
          color: sent ? "var(--chrome-faint)" : "var(--chrome-dim)",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        Report this as incorrect
      </button>
      <span className="sr-only">{subject}</span>
      {sent && (
        <p className="mt-2 t-body" style={{ color: "var(--chrome-faint)" }}>
          Noted locally. Reports start reaching us when the API lands.
        </p>
      )}
    </div>
  );
}

export function FindingDetail({
  mark,
  position,
  total,
  onClose,
}: {
  mark: Mark;
  position: number;
  total: number;
  onClose: () => void;
}) {
  const { check, finding } = mark;
  const reason = check.reason ? REASON[check.reason] : null;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <VerdictChip key={mark.key} verdict={mark.verdict} />
        <div className="flex items-center gap-3">
          <span className="t-num" style={{ fontSize: "11px", color: "var(--chrome-faint)" }}>
            {position} of {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] px-1.5 py-1 t-body"
            style={{ color: "var(--chrome-faint)", fontSize: "12px" }}
          >
            Close
            <kbd className="ml-1.5 t-num" style={{ fontSize: "11px" }}>
              esc
            </kbd>
          </button>
        </div>
      </div>

      {/* The claim, quoted, in serif — the paper speaking, not the instrument.
          `verbatim` is empty when the claim is a table cell rather than prose; the
          anchor's locator names it instead, and nothing is invented to fill the
          space. */}
      {finding?.verbatim ? (
        <blockquote
          className="mt-4 border-s-2 ps-3"
          style={{
            borderColor: "var(--chrome-line)",
            fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
            fontSize: "16px",
            lineHeight: 1.55,
            color: "var(--chrome-text)",
          }}
        >
          {finding.verbatim}
        </blockquote>
      ) : (
        <p
          className="mt-4"
          style={{
            fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
            fontSize: "16px",
            lineHeight: 1.55,
            color: "var(--chrome-dim)",
          }}
        >
          {mark.locator}
        </p>
      )}

      {finding ? (
        <ComparisonBlock finding={finding} locator={mark.locator} />
      ) : (
        <p className="mt-3 t-body" style={{ color: "var(--chrome-dim)" }}>
          {mark.verdict === "not_attempted"
            ? "There is no comparison to show: this part of the paper was not checked."
            : "There is no comparison to show. The check reached no numbers here it could compare."}
        </p>
      )}

      {reason && (
        <div
          className="mt-3 rounded-[4px] border px-3 py-2.5"
          style={{ borderColor: "var(--chrome-line)" }}
        >
          <p className="t-emph" style={{ color: "var(--chrome-text)" }}>
            {reason.label}
          </p>
          {reason.next && (
            <p className="mt-1 t-body" style={{ color: "var(--chrome-dim)" }}>
              {reason.next}
            </p>
          )}
        </div>
      )}

      {/* The check that produced it, with its one-line plain-English description. */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--chrome-line)" }}>
        <h2 className="t-panel-title" style={{ color: "var(--chrome-text)" }}>
          {check.display_name || check.checker}
        </h2>
        {check.description && (
          <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
            {check.description}
          </p>
        )}
        {finding?.explanation && (
          <p className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
            {finding.explanation}
          </p>
        )}
        <p className="mt-2 t-num" style={{ fontSize: "12px", color: "var(--chrome-faint)" }}>
          {check.checker} v{check.checker_version} · {VERDICT_LABEL[mark.verdict]}
        </p>
      </div>

      <ReportControl subject={mark.locator} />
    </div>
  );
}
