"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Form primitives for the account screens, drawn in the landing page's system
 * rather than the app's dark chrome: white cards on the #d9d9d9 field, 16px
 * inner radius, the black pill for the one primary control per screen.
 *
 * These are separate from `components/ui/*` on purpose. Those are shadcn
 * primitives tuned for `--chrome-*`, and dropping one on `--site-base` produces
 * a dark input on a light page.
 *
 * Every control here is a real control: `<label for>` tied to a real `<input>`,
 * `<fieldset>`/`<legend>` around a radio group, `aria-describedby` to the help
 * text, `aria-invalid` and `role="alert"` on the error. Nothing is a `<div>`
 * pretending.
 */

/** A white card. The shape every section on these three pages sits in. */
export function Panel({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return (
    <As
      className={cn("p-6 two:p-9", className)}
      style={{ background: "var(--site-card)", borderRadius: "var(--site-radius-card)" }}
    >
      {children}
    </As>
  );
}

/** The small caps-free label above a control. */
export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block"
      style={{ fontSize: "15px", fontWeight: 500, lineHeight: 1.5, color: "var(--site-ink)" }}
    >
      {children}
    </label>
  );
}

/** Help text under a control. Never the error; the error has its own slot. */
export function FieldHelp({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5" style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--site-muted)" }}>
      {children}
    </p>
  );
}

/**
 * One field error. §7's rule for verdicts applies to forms too: say what
 * happened and what to do, in that order, without apologising.
 */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 flex items-start gap-2"
      style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--site-ink)" }}
    >
      {/* A glyph as well as the colour, so the accent is never the only signal. */}
      <span aria-hidden="true" className="site-mono shrink-0" style={{ color: "var(--site-accent)" }}>
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

const inputClass =
  "w-full min-w-0 px-4 py-3 outline-none transition-colors placeholder:text-[var(--site-muted)]";

function inputStyle(invalid?: boolean): React.CSSProperties {
  return {
    background: "var(--site-card)",
    border: `1px solid ${invalid ? "var(--site-accent)" : "var(--site-line-strong)"}`,
    borderRadius: "var(--site-radius-inner)",
    color: "var(--site-ink)",
    // 16px: anything smaller and iOS Safari zooms the page on focus.
    fontSize: "16px",
    lineHeight: 1.5,
    transitionDuration: "var(--dur-fast)",
  };
}

export function TextInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  invalid,
  describedBy,
  autoComplete,
  autoFocus,
  inputMode,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "url";
  /** Identifiers, image references and commands are set in Fragment Mono. */
  mono?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "email" | "url";
}) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      inputMode={inputMode}
      spellCheck={false}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(inputClass, mono && "site-mono")}
      style={inputStyle(invalid)}
    />
  );
}

export function TextArea({
  id,
  name,
  value,
  onChange,
  placeholder,
  rows = 3,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <textarea
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(inputClass, "site-mono resize-y")}
      style={inputStyle(invalid)}
    />
  );
}

/**
 * A radio group drawn as pills. The `<input>` is present and focusable — it is
 * only visually hidden — so keyboard arrow behaviour, form semantics and screen
 * reader output are the browser's rather than something reimplemented here. The
 * ring is drawn on the pill by `has-[:focus-visible]`, so focus stays visible.
 */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  describedBy,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  describedBy?: string;
}) {
  return (
    <fieldset aria-describedby={describedBy}>
      <legend
        className="mb-2"
        style={{ fontSize: "15px", fontWeight: 500, lineHeight: 1.5, color: "var(--site-ink)" }}
      >
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className="cursor-pointer px-5 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
              style={{
                background: selected ? "var(--site-ink)" : "var(--site-card)",
                border: `1px solid ${selected ? "var(--site-ink)" : "var(--site-line-strong)"}`,
                borderRadius: "var(--site-radius-pill)",
                color: selected ? "#ffffff" : "var(--site-ink)",
                fontSize: "15px",
                fontWeight: 500,
                lineHeight: 1.3,
                transitionDuration: "var(--dur-fast)",
              }}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The one filled control per screen. Same shape as the site's `PrimaryLink`. */
export function PrimaryButton({
  children,
  type = "submit",
  onClick,
  className,
}: {
  children: ReactNode;
  type?: "submit" | "button";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "site-lift inline-flex items-center justify-center gap-2 px-7 py-3.5 transition-transform",
        className,
      )}
      style={{
        background: "var(--site-ink)",
        color: "#ffffff",
        borderRadius: "var(--site-radius-pill)",
        fontSize: "16px",
        fontWeight: 600,
        lineHeight: 1.2,
        transitionDuration: "var(--dur-panel)",
      }}
    >
      {children}
    </button>
  );
}

/** The quiet control beside it. */
export function GhostButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center justify-center gap-2 px-5 py-2.5 transition-colors", className)}
      style={{
        border: "1px solid var(--site-line-strong)",
        borderRadius: "var(--site-radius-pill)",
        color: "var(--site-ink)",
        fontSize: "15px",
        fontWeight: 500,
        lineHeight: 1.2,
        transitionDuration: "var(--dur-fast)",
      }}
    >
      {children}
    </button>
  );
}
