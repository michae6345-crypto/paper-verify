"use client";

import { useState } from "react";

/**
 * A verification record ID, and a button to copy it.
 *
 * The ID is set in Fragment Mono with tabular figures, like every other
 * identifier in this product. It is meant to be copied into a submission form,
 * so copying it is a button rather than a select-and-drag.
 *
 * What it is not: proof. It was generated in this browser and no server has seen
 * it, so nobody can look it up and nothing confirms it. `/account` states that
 * beside the list rather than letting a serious-looking format imply a registry
 * that does not exist.
 */
export function RecordId({ id, size = "small" }: { id: string; size?: "small" | "large" }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refusable and is refused on insecure origins. The
      // ID is on screen and selectable either way, so this is not an error
      // worth a banner.
      setCopied(false);
    }
  }

  const large = size === "large";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        className="site-mono inline-block px-4 py-2"
        style={{
          background: large ? "var(--site-base)" : "transparent",
          border: `1px solid ${large ? "transparent" : "var(--site-line)"}`,
          borderRadius: "var(--site-radius-inner)",
          fontSize: large ? "clamp(16px, 2.6vw, 22px)" : "13px",
          letterSpacing: "0.02em",
          color: "var(--site-ink)",
        }}
      >
        {id}
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center px-4 py-2 transition-colors"
        style={{
          border: "1px solid var(--site-line-strong)",
          borderRadius: "var(--site-radius-pill)",
          fontSize: "14px",
          fontWeight: 500,
          color: "var(--site-ink)",
          transitionDuration: "var(--dur-fast)",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {/* The label change alone is silent to a screen reader on a button that
          already had focus, so the outcome is announced separately. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `Verification record ${id} copied` : ""}
      </span>
    </span>
  );
}
