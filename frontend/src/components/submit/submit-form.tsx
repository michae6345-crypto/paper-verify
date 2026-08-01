"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { parseArxivId } from "@/lib/arxiv";

/**
 * §5.1: one 480px input, one line of helper text. No hero, no marketing copy,
 * no feature grid.
 *
 * There is no backend (§11), so an ID we hold a report for opens that report and
 * anything else says exactly that. §7: errors state what happened and what to do,
 * without apologising and without being vague.
 */
export function SubmitForm({ knownIds }: { knownIds: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseArxivId(value);

    if (!id) {
      setError("That doesn't look like an arXiv ID or URL. Try 1706.03762.");
      return;
    }
    if (!knownIds.includes(id)) {
      setError(
        `No report for ${id} — this build runs on saved reports and is not yet connected to the checker. Open one of the papers below.`,
      );
      return;
    }
    setError(null);
    router.push(`/runs/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[480px]">
      <label htmlFor="arxiv" className="t-label">
        Check a paper
      </label>

      <div className="mt-2 flex gap-2">
        <input
          id="arxiv"
          name="arxiv"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="arXiv ID or URL"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="arxiv-help"
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 rounded-[6px] border px-3 py-2 t-num outline-none"
          style={{
            borderColor: "var(--chrome-line)",
            background: "var(--chrome-panel)",
            color: "var(--chrome-text)",
          }}
        />
        <button
          type="submit"
          className="shrink-0 rounded-[6px] border px-3 py-2 t-emph transition-colors"
          style={{
            borderColor: "var(--chrome-line)",
            background: "var(--chrome-raised)",
            color: "var(--chrome-text)",
            transitionDuration: "var(--dur-fast)",
          }}
        >
          Run checks
        </button>
      </div>

      <p id="arxiv-help" className="mt-2 t-body" style={{ color: "var(--chrome-dim)" }}>
        Checks the paper&apos;s tables, citations, and links against each other.
      </p>

      {error && (
        <p role="alert" className="mt-2 t-body" style={{ color: "var(--chrome-text)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
