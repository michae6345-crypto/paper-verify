"use client";

import { useState } from "react";

import { VERDICT_LABEL } from "@/lib/verdict";
import { reasonSentence } from "./reasons";
import type { LedgerRowData } from "./groups";

/**
 * What "Explain" opens: how this row's verdict was arrived at.
 *
 * It is a derivation, not an argument. Everything here is either a value the
 * checker read, a value it computed, or the identity of the rule that compared
 * them. Nothing narrates, and nothing here calls the paper wrong — the reader
 * is being handed the working, in §7's vocabulary, so they can disagree with a
 * specific step.
 */

/** Display-only: ASCII hyphen → real minus, so signed columns align in mono. */
function typesetNumber(value: string): string {
  return value.replace(/^-/, "−");
}

function ReportControl({ subject }: { subject: string }) {
  const [sent, setSent] = useState(false);

  // §5.4: always present, always one click. There is no endpoint behind it yet,
  // so it says so rather than pretending to have sent something.
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setSent(true)}
        disabled={sent}
        className="border px-2.5 py-1.5 t-body transition-colors"
        style={{
          borderRadius: "var(--radius-control)",
          borderColor: "var(--chrome-line)",
          color: sent ? "var(--chrome-faint)" : "var(--chrome-dim)",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        Report this as incorrect
      </button>
      <span className="sr-only">{subject}</span>
      {sent && (
        <p className="mt-1.5 t-body" style={{ color: "var(--chrome-faint)" }}>
          Noted locally. Reports start reaching us when the API lands.
        </p>
      )}
    </div>
  );
}

export function Derivation({ row, id }: { row: LedgerRowData; id: string }) {
  const { check, finding } = row;
  const sentence = reasonSentence(row.reason);
  const policy = check.policy_version ?? "";
  // The identity that survives a version bump, unlike the siglum beside it. Cut
  // to twelve characters: enough to quote back in a bug report, and the full
  // hash would wrap three lines of a 45%-wide pane to no one's benefit.
  const print = check.fingerprint ?? "";

  const values: [string, string][] = [];
  if (finding?.claimed != null) values.push(["claimed", typesetNumber(finding.claimed)]);
  if (finding?.computed != null) values.push(["computed", typesetNumber(finding.computed)]);
  if (finding?.delta != null) values.push(["delta", typesetNumber(finding.delta)]);
  if (row.locator) values.push(["source", row.locator]);

  return (
    <div
      id={id}
      className="mt-3 border px-3 py-2.5"
      // `--field-deep` sits below `--chrome-base`, so the working reads as a
      // section cut into the ledger rather than as another panel stacked on it.
      style={{
        borderRadius: "var(--radius-panel)",
        borderColor: "var(--chrome-line)",
        background: "var(--field-deep)",
      }}
    >
      <p className="t-body" style={{ color: "var(--chrome-dim)" }}>
        {check.description || "This check has no description on file."}
      </p>

      {values.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1">
          {values.map(([key, value]) => (
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
      )}

      {finding?.explanation && (
        <p className="mt-2.5 t-body" style={{ color: "var(--chrome-dim)" }}>
          {finding.explanation}
        </p>
      )}

      {!finding && sentence && (
        <p className="mt-2.5 t-body" style={{ color: "var(--chrome-dim)" }}>
          {sentence}
        </p>
      )}

      {row.detail && row.detail !== check.description && (
        <p className="mt-2 t-body" style={{ color: "var(--chrome-faint)" }}>
          {row.detail}
        </p>
      )}

      <p
        className="mt-3 t-num break-words"
        style={{ fontSize: "12px", color: "var(--chrome-faint)" }}
      >
        {check.checker === "not_checked" ? (
          VERDICT_LABEL[row.verdict]
        ) : (
          <>
            {check.checker} v{check.checker_version} · policy {policy || "not versioned"} ·{" "}
            {VERDICT_LABEL[row.verdict]}
            {print ? ` · ${print.slice(0, 12)}` : ""}
          </>
        )}
      </p>

      <ReportControl subject={row.title} />
    </div>
  );
}
