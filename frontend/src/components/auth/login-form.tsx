"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  FieldError,
  FieldHelp,
  FieldLabel,
  Panel,
  PrimaryButton,
  TextInput,
} from "@/components/auth/controls";
import { signIn } from "@/components/auth/session";
import { useIsHydrated, useSession } from "@/components/auth/use-session";

/**
 * One field, one button, no password.
 *
 * The email is not sent anywhere and not confirmed. It is a label on a
 * `localStorage` entry, and the banner above this form says so. It is still
 * validated for shape, because a field that silently accepts `asdf` teaches the
 * user that the form does not read what they type.
 */

/**
 * Deliberately loose: something, an `@`, something with a dot in it. Full
 * RFC 5322 in a regex rejects addresses that work, and this address is not being
 * delivered to.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Only same-origin paths are followed after sign-in. `next=https://elsewhere`
 * would make this a redirector for anyone who can get a link clicked, and a
 * protocol-relative `//host` reads as a path but is not one.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/submit";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/submit";
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const hydrated = useIsHydrated();

  // The field prefills with whoever is already signed in, so "continue as
  // someone else" is an edit rather than a retype. Derived rather than copied
  // into state by an effect: `draft` stays null until the user types, and the
  // session is the value until then. `""` is a real draft, so clearing the field
  // leaves it clear.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const email = draft ?? session?.email ?? "";
  const next = safeNext(params.get("next"));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();

    if (!value) {
      setError("Enter an email address. Any address works, including one you make up.");
      return;
    }
    if (!EMAIL.test(value)) {
      setError(`"${value}" is not shaped like an email address. It needs an @ and a domain.`);
      return;
    }
    if (!signIn(value)) {
      setError(
        "This browser refused to store the session, which private browsing and blocked site data both do. Try a normal window.",
      );
      return;
    }
    setError(null);
    router.push(next);
  }

  return (
    <Panel as="section">
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <div className="mt-2">
          <TextInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(value) => {
              setDraft(value);
              if (error) setError(null);
            }}
            placeholder="you@university.edu"
            mono
            invalid={!!error}
            describedBy={error ? "email-error email-help" : "email-help"}
          />
        </div>
        <FieldHelp id="email-help">
          No password, and no email is sent. The address is a label on a session stored in this
          browser.
        </FieldHelp>
        {error && <FieldError id="email-error">{error}</FieldError>}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <PrimaryButton>Continue</PrimaryButton>
          <Link
            href="/"
            className="underline underline-offset-4"
            style={{ fontSize: "15px", color: "var(--site-muted)" }}
          >
            What residual checks
          </Link>
        </div>
      </form>

      {hydrated && session && (
        <p
          className="mt-6 pt-6"
          style={{
            borderTop: "1px solid var(--site-line)",
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--site-muted)",
          }}
        >
          This browser is currently signed in as{" "}
          <span className="site-mono" style={{ color: "var(--site-ink)" }}>
            {session.email}
          </span>
          . Continuing with a different address replaces it. Submissions already recorded stay in
          this browser and remain visible on{" "}
          <Link href="/account" className="underline underline-offset-4">
            account
          </Link>
          .
        </p>
      )}
    </Panel>
  );
}
