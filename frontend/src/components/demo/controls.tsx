"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The four controls this form needs that `components/auth/controls.tsx` does not
 * have. Everything else on this page — `FieldLabel`, `FieldHelp`, `FieldError` —
 * is imported from there rather than redrawn here.
 *
 * **Why these four are not in that file.** `CLAUDE.md` is explicit that two
 * modules implementing the same primitives in two different ways is this
 * repository's characteristic failure, so the split is recorded rather than left
 * to be discovered:
 *
 *   `TextField`      auth's `TextInput` takes no `onBlur`, and this form has to
 *                    catch a malformed address when the field is left rather
 *                    than only when the form is submitted.
 *   `TextAreaField`  auth's `TextArea` is hard-wired to `site-mono`, which is
 *                    right for a shell command and wrong for a sentence of
 *                    English about what somebody wants checked.
 *   `SelectField`    there is no select in that file at all.
 *   `SubmitControl`  auth's `PrimaryButton` cannot be disabled, and this one has
 *                    to be while the request is being written.
 *
 * The honest fix is for `auth/controls.tsx` to grow `onBlur`, a `mono` flag on
 * the textarea to match the one its input already has, and a `disabled` prop —
 * at which point three of these four delete themselves. That file belongs to
 * another workstream, so it is in the report instead of edited here.
 *
 * The shared input skin below is copied from it verbatim rather than
 * reinterpreted, so the two cannot drift apart on colour or radius.
 */

/**
 * 16px is not a preference: below it, iOS Safari zooms the page on focus.
 *
 * **No `outline-none` here, and that is the one deliberate difference from the
 * skin this was copied from.** `auth/controls.tsx` carries it, which sets
 * `outline-style: none` and beats the `:focus-visible` rule in `globals.css`
 * that is supposed to put a 2px ring on every interactive element — so those
 * inputs have no visible focus at all, while the links and buttons beside them
 * do. Measured in Chromium: `2px none` on the input, `2px solid` on the button.
 * §12 says a visible ring on every interactive element, so this drops the
 * utility and lets the global rule land. The same removal is worth making in
 * that file; it is in the report rather than done here.
 */
const inputClass = "w-full min-w-0 px-4 py-3 transition-colors";

function inputStyle(invalid?: boolean): React.CSSProperties {
  return {
    background: "var(--site-card)",
    border: `1px solid ${invalid ? "var(--site-accent)" : "var(--site-line-strong)"}`,
    borderRadius: "var(--site-radius-inner)",
    color: "var(--site-ink)",
    fontSize: "16px",
    lineHeight: 1.5,
    transitionDuration: "var(--dur-fast)",
  };
}

export function TextField({
  id,
  name,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  invalid,
  describedBy,
  autoComplete,
  inputMode,
  required,
  ref,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: "text" | "email";
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
  inputMode?: "text" | "email";
  required?: boolean;
  /** So the form can move focus to the first field that needs work. React 19
   *  passes `ref` as an ordinary prop, so there is no `forwardRef` here. */
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={ref}
      id={id}
      name={name}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete={autoComplete}
      inputMode={inputMode}
      // `noValidate` is on the form: the browser bubble cannot be styled, cannot
      // be read by a screen reader on some platforms, and stops at the first
      // field. `aria-required` still tells assistive technology what the visible
      // "required" note tells everyone else.
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(inputClass, "placeholder:text-[var(--site-muted)]")}
      style={inputStyle(invalid)}
    />
  );
}

export function TextAreaField({
  id,
  name,
  value,
  onChange,
  placeholder,
  rows = 3,
  describedBy,
  maxLength,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  describedBy?: string;
  maxLength?: number;
}) {
  return (
    <textarea
      id={id}
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      aria-describedby={describedBy}
      className={cn(inputClass, "resize-y placeholder:text-[var(--site-muted)]")}
      style={inputStyle(false)}
    />
  );
}

/**
 * A native `<select>`, on purpose.
 *
 * A listbox rebuilt out of divs has to reimplement type-ahead, arrow keys,
 * `Home`/`End`, the mobile picker and the screen reader's own idea of what a
 * select is — and this form has one of them, holding six options. The native
 * control already does all of that, and on a phone it opens the platform wheel
 * rather than a scrolling menu inside a 390px viewport.
 *
 * What is drawn here is the chevron, because `appearance: none` removes the
 * platform one along with the platform skin. It is `aria-hidden` and
 * `pointer-events-none`, so it is a mark on the control rather than a control.
 */
export function SelectField<T extends string>({
  id,
  name,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  invalid,
  describedBy,
  required,
  ref,
}: {
  id: string;
  name: string;
  value: T | "";
  onChange: (value: T | "") => void;
  onBlur?: () => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  /** The unchosen state. Omit it when the control has a sensible default. */
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  ref?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <div className="relative">
      <select
        ref={ref}
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value as T | "")}
        onBlur={onBlur}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(inputClass, "appearance-none pr-12")}
        style={{
          ...inputStyle(invalid),
          // The unchosen state reads as placeholder text, the way the empty
          // inputs beside it do. Once something is chosen it is ink.
          color: value === "" ? "var(--site-muted)" : "var(--site-ink)",
        }}
      >
        {placeholder !== undefined && (
          // Selectable rather than `disabled`, so somebody who opened the menu
          // by accident can back out of it with the keyboard. It fails
          // validation like any other empty required field.
          <option value="">{placeholder}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-4 flex items-center"
      >
        <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
          <path
            d="M1 1L7 7L13 1"
            stroke="var(--site-ink)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

/**
 * The one filled control on the page, and the only one that can be disabled.
 *
 * Same shape as `PrimaryLink` and `PrimaryButton`: black pill, white label,
 * `site-lift` for the page's one allowed shadow. Full width below the
 * breakpoint, because a 390px screen has room for a control that is easy to hit
 * and no reason to make it hard.
 *
 * `aria-busy` rather than a spinner. The label changes, the control stops
 * accepting input, and a live region beside it says what is happening; a
 * rotating element would also be the one thing on this page that rotates.
 */
export function SubmitControl({
  children,
  busy,
  className,
}: {
  children: ReactNode;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      className={cn(
        "site-lift inline-flex w-full items-center justify-center gap-2 px-7 py-3.5 transition-transform two:w-auto",
        busy && "cursor-not-allowed",
        className,
      )}
      style={{
        background: "var(--site-ink)",
        color: "#ffffff",
        borderRadius: "var(--site-radius-pill)",
        fontSize: "16px",
        fontWeight: 600,
        lineHeight: 1.2,
        minHeight: "52px",
        opacity: busy ? 0.55 : 1,
        transitionDuration: "var(--dur-panel)",
      }}
    >
      {children}
    </button>
  );
}
