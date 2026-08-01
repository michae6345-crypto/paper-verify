"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import type { AmendmentClient, ContestInput } from "./client";
import {
  CANCEL,
  CONTEST_ACTION,
  CONTEST_INTRO,
  CONTEST_RECEIVED,
  CORRECTED_HINT,
  CORRECTED_LABEL,
  SENDING,
  STATEMENT_LABEL,
  STATEMENT_PLACEHOLDER,
  SUBMIT,
} from "./copy";

/**
 * The Contest affordance on a Discrepancy row, and the form behind it.
 *
 * Mounted by the ledger (`components/ledger/**`, Agent Q) — see `index.ts` for
 * the props and where they come from. This file owns only the interaction.
 *
 * Three decisions worth stating, because each of them is a temptation resisted:
 *
 * **It is an inline panel, not a modal.** The finding has to stay visible while
 * an author writes about it. A dialog that covers the numbers asks someone to
 * argue from memory with a claim we have just published about them.
 *
 * **It renders as unavailable rather than absent when there is no fingerprint.**
 * A missing fingerprint means the report is a fixture, or the row is one of two
 * findings a row key cannot tell apart. Hiding the affordance would leave an
 * author looking for a way to respond and concluding there is none. Showing a
 * button that silently fails would be worse. It says why.
 *
 * **The verdict colours are absent from it.** §7 keeps verdict colour off
 * buttons. A Contest button in the `diverges` red would read as an alarm, and
 * this is a normal action.
 */

export type ContestState = "idle" | "open" | "sending" | "sent" | "failed";

export function ContestButton({
  fingerprint,
  contested = false,
  disabled = false,
  onOpen,
  className,
}: {
  /** From `AmendmentClient.findings`. Null when this row has no identity to contest. */
  fingerprint: string | null;
  /** True when a statement already stands against this finding. */
  contested?: boolean;
  disabled?: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const unavailable = fingerprint === null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled || unavailable}
      // The reason is on the control itself rather than in a tooltip: an author
      // who cannot use this needs to know why without hunting for it.
      title={
        unavailable
          ? "This finding cannot be contested from here yet."
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] t-body disabled:opacity-50",
        className,
      )}
      style={{ color: "var(--chrome-dim)" }}
    >
      {contested ? "Contested" : CONTEST_ACTION}
    </button>
  );
}

export function ContestForm({
  runId,
  fingerprint,
  client,
  onSent,
  onCancel,
}: {
  runId: string;
  fingerprint: string;
  client: AmendmentClient;
  onSent?: (input: ContestInput) => void;
  onCancel?: () => void;
}) {
  const statementId = useId();
  const correctedId = useId();
  const [statement, setStatement] = useState("");
  const [corrected, setCorrected] = useState("");
  const [state, setState] = useState<ContestState>("open");
  const [failure, setFailure] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!statement.trim() || state === "sending") return;

    const input: ContestInput = {
      findingFingerprint: fingerprint,
      authorStatement: statement.trim(),
      correctedValue: corrected.trim() || null,
    };

    setState("sending");
    setFailure("");
    try {
      await client.contest(runId, input);
      setState("sent");
      onSent?.(input);
    } catch (error) {
      // The statement stays in the field. Losing what someone wrote about a
      // public claim against them, because a request failed, is not recoverable
      // by asking them to type it again.
      setState("failed");
      setFailure(error instanceof Error ? error.message : "That could not be sent.");
    }
  }

  if (state === "sent") {
    return (
      <p className="t-body" style={{ color: "var(--chrome-dim)" }} role="status">
        {CONTEST_RECEIVED}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="t-body" style={{ color: "var(--chrome-dim)" }}>
        {CONTEST_INTRO}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="t-emph" style={{ color: "var(--chrome-text)" }}>
          {STATEMENT_LABEL}
        </span>
        <textarea
          id={statementId}
          required
          rows={4}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder={STATEMENT_PLACEHOLDER}
          className="rounded-[4px] border px-2.5 py-2 t-body"
          style={{
            borderColor: "var(--chrome-line)",
            backgroundColor: "var(--chrome-panel)",
            color: "var(--chrome-text)",
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="t-emph" style={{ color: "var(--chrome-text)" }}>
          {CORRECTED_LABEL}
        </span>
        <input
          id={correctedId}
          value={corrected}
          onChange={(e) => setCorrected(e.target.value)}
          // The paper's own formatting is part of the claim, so this is a string
          // and not a number input: 41.8, 3.3·10^18 and "—" are all legitimate.
          inputMode="text"
          className="rounded-[4px] border px-2.5 py-1.5 t-num"
          style={{
            borderColor: "var(--chrome-line)",
            backgroundColor: "var(--chrome-panel)",
            color: "var(--chrome-text)",
          }}
        />
        <span className="t-body" style={{ fontSize: "12px", color: "var(--chrome-faint)" }}>
          {CORRECTED_HINT}
        </span>
      </label>

      {failure && (
        <p className="t-body" style={{ color: "var(--chrome-dim)" }} role="alert">
          {failure} Your statement is still here.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "sending" || !statement.trim()}
          className="rounded-[4px] border px-2.5 py-1 t-emph disabled:opacity-50"
          style={{ borderColor: "var(--chrome-line)", color: "var(--chrome-text)" }}
        >
          {state === "sending" ? SENDING : SUBMIT}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="t-body"
            style={{ color: "var(--chrome-dim)" }}
          >
            {CANCEL}
          </button>
        )}
      </div>
    </form>
  );
}
