"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { FieldError, FieldHelp, FieldLabel } from "@/components/auth/controls";
import { SelectField, SubmitControl, TextAreaField, TextField } from "@/components/demo/controls";
import {
  addDemoRequest,
  asksAboutVenue,
  formatRequestedAt,
  newRequestId,
  labelForUseCase,
  useDemoRequests,
  labelForVolume,
  USE_CASE_OPTIONS,
  VOLUME_OPTIONS,
  type DemoRequest,
  type DemoUseCase,
  type DemoVolume,
} from "@/components/demo/demo-requests";
import { useReducedMotionGate } from "@/components/site/motion/scrub";
import { Card } from "@/components/site/ui";

/**
 * The demo request form.
 *
 * Six fields, three of them required, and two of the other three only appear
 * once they can mean something. The list is short on purpose: this is a request
 * for a conversation, not an application, and every field past the ones that
 * change what the conversation is about costs a completion and buys nothing.
 *
 *   name          a reply has to be addressed to somebody.
 *   email         the only route back. The one field validated properly.
 *   use case      what the demo should show. A single paper and a programme
 *                 committee want two different half hours.
 *   organisation  only asked once the answer above implies there is one.
 *   volume        the same. Bands, not a number, because nobody knows the number.
 *   what to check the free line. It is where the mismatch between what somebody
 *                 expects and what residual does shows up before the call, which
 *                 makes it the most useful optional field on the page.
 *
 * Nothing here asks for a job title, a phone number, a company size, or how they
 * heard about us.
 *
 * **What submitting does.** It writes the request to `localStorage` and shows
 * what it wrote. No email is sent, nothing is transmitted, nobody is notified,
 * and the success state says all three in its first sentence. See
 * `demo-requests.ts`.
 */

/**
 * Deliberately loose, and the looseness is the point.
 *
 * `CLAUDE.md` names this repository's recurring defect: a narrowing step that
 * discards something a verdict then rests on. An email regex is that defect in
 * miniature — the strict-looking ones reject `ada+conf@lovelace.ac.uk`, hyphens,
 * long TLDs and every internationalised domain, and the cost of a false reject
 * here is a person who cannot ask for a demo at all.
 *
 * So this checks the three things a typo actually breaks: something before an
 * `@`, exactly one `@`, and a domain with a dot in it. Anything else is the
 * mail server's judgement to make, not this form's.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

type FieldKey = "name" | "email" | "useCase";
type Errors = Partial<Record<FieldKey | "store", string>>;

function nameProblem(raw: string): string | null {
  if (!raw.trim()) return "Enter a name. A request with nobody's name on it is hard to answer.";
  return null;
}

function emailProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter an email address. It is the only way an answer could reach you.";
  if (!EMAIL_SHAPE.test(value)) {
    return `"${value}" is missing part of an address. It needs a name, an @, and a domain with a dot in it, like ada@lovelace.ac.uk.`;
  }
  return null;
}

function problemWithUseCase(value: DemoUseCase | ""): string | null {
  if (!value) return "Choose the closest one. It decides what a demo is worth showing.";
  return null;
}

/**
 * The stagger. Fields arrive in order over 200ms, which is inside the 300ms the
 * rest of the page caps a timeline at, and reads as one card settling rather
 * than six rows being dealt out.
 *
 * It also does the work for the two conditional fields for free: a child
 * mounting into a parent that is already at `shown` starts from `hidden` and
 * animates, so choosing a use case fades the venue fields in without anything
 * animating its height.
 */
const FIELD_LIST = {
  hidden: {},
  shown: { transition: { delayChildren: 0.06, staggerChildren: 0.04 } },
} as const;

const FIELD_ITEM = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
} as const;

/**
 * How long the control stays disabled after a valid submit.
 *
 * Not a request, and not pretending to be one: the write is synchronous and has
 * already happened. It is the length of the swap, and it exists so the control
 * cannot be pressed twice while React replaces the form with the confirmation.
 * Under reduced motion there is no swap to cover, so there is no wait.
 */
const SWAP_MS = 240;

export function DemoForm() {
  const reduced = useReducedMotionGate();
  const previous = useDemoRequests();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState<DemoUseCase | "">("");
  const [organisation, setOrganisation] = useState("");
  const [volume, setVolume] = useState<DemoVolume>("unsure");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<DemoRequest | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const useCaseRef = useRef<HTMLSelectElement>(null);

  const venue = asksAboutVenue(useCase);

  /**
   * Validate when a field is left, not while it is being typed into — and only
   * when there is something in it to be wrong.
   *
   * The difference matters. Judging an empty required field on blur means a
   * keyboard user tabbing from the top of the form to the bottom collects three
   * errors before typing a character, which is the form telling somebody off for
   * reading it. An empty required field is caught on submit, where it belongs.
   * A malformed address is caught here, the moment they leave the field, which
   * is what blur validation is actually for.
   */
  function checkOnBlur(key: FieldKey) {
    const raw = key === "name" ? name : key === "email" ? email : useCase;
    if (!raw.trim()) {
      setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
      return;
    }
    const problem =
      key === "name"
        ? nameProblem(name)
        : key === "email"
          ? emailProblem(email)
          : problemWithUseCase(useCase);
    setErrors((prev) => ({ ...prev, [key]: problem ?? undefined }));
  }

  /** Typing is an attempt to fix it, so the message goes as soon as it starts. */
  function clear(key: FieldKey) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const next: Errors = {};
    const nameError = nameProblem(name);
    const emailError = emailProblem(email);
    const useCaseError = problemWithUseCase(useCase);
    if (nameError) next.name = nameError;
    if (emailError) next.email = emailError;
    if (useCaseError) next.useCase = useCaseError;

    if (nameError || emailError || useCaseError) {
      setErrors(next);
      // Focus lands on the first field that needs work. Its message is wired to
      // the control through `aria-describedby`, so a screen reader reads the
      // problem on arrival rather than announcing three alerts at once and
      // leaving the user to find which control they belong to.
      (nameError ? nameRef : emailError ? emailRef : useCaseRef).current?.focus();
      return;
    }

    const request: DemoRequest = {
      id: newRequestId(),
      name: name.trim(),
      email: email.trim(),
      useCase: useCase as DemoUseCase,
      organisation: venue ? organisation.trim() : "",
      volume: venue ? volume : "unsure",
      notes: notes.trim(),
      requestedAt: new Date().toISOString(),
    };

    setBusy(true);

    if (!addDemoRequest(request)) {
      // Private browsing and blocked site data both do this. The request is
      // genuinely gone, so the form stays exactly as it is and says so.
      setBusy(false);
      setErrors({
        store:
          "This browser refused to store the request, which private browsing and blocked site data both do. Nothing was kept and nothing was sent. Try a normal window.",
      });
      return;
    }

    setErrors({});
    // Focus is not moved from here. The confirmation moves it to itself when it
    // mounts, which is the only moment the heading is guaranteed to exist. See
    // the note on `Recorded`.
    window.setTimeout(
      () => {
        setBusy(false);
        setRecorded(request);
      },
      reduced ? 0 : SWAP_MS,
    );
  }

  if (recorded) {
    return (
      <Recorded
        request={recorded}
        reduced={reduced}
        onAnother={() => {
          setRecorded(null);
          setName("");
          setEmail("");
          setUseCase("");
          setOrganisation("");
          setVolume("unsure");
          setNotes("");
          setErrors({});
        }}
      />
    );
  }

  return (
    <Card elevation="card" className="p-6 two:p-9">
      {/* Not while the request is being written. `addDemoRequest` announces on
          the store event synchronously, so without the guard the request being
          submitted immediately counts itself as a previous one and this line
          appears at the top of the card mid-swap, pushing every field down
          240ms before the card is replaced anyway. */}
      {previous.length > 0 && !busy && (
        <p
          className="mb-6"
          style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--site-muted)" }}
        >
          A request from this browser was recorded on {formatRequestedAt(previous[0].requestedAt)}.
          It is still only in this browser.
        </p>
      )}

      <h2 className="site-h3">Tell us what to put in front of it</h2>
      <p className="site-body mt-2 max-w-[54ch]">
        Three questions that change what a demo shows, and three you can skip.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8">
        {/* Disabled as a group while the request is written, so a second press
            cannot record a second copy and a late keystroke cannot edit a
            request that has already been kept. */}
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          <FieldList reduced={reduced}>
            <Field reduced={reduced}>
              <FieldLabel htmlFor="demo-name">Name</FieldLabel>
              <div className="mt-2">
                <TextField
                  id="demo-name"
                  name="name"
                  value={name}
                  onChange={(value) => {
                    setName(value);
                    clear("name");
                  }}
                  onBlur={() => checkOnBlur("name")}
                  autoComplete="name"
                  required
                  invalid={!!errors.name}
                  describedBy={errors.name ? "demo-name-error" : undefined}
                  ref={nameRef}
                />
              </div>
              {errors.name && <FieldError id="demo-name-error">{errors.name}</FieldError>}
            </Field>

            <Field reduced={reduced}>
              <FieldLabel htmlFor="demo-email">Email</FieldLabel>
              <div className="mt-2">
                <TextField
                  id="demo-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(value) => {
                    setEmail(value);
                    clear("email");
                  }}
                  onBlur={() => checkOnBlur("email")}
                  placeholder="ada@lovelace.ac.uk"
                  autoComplete="email"
                  required
                  invalid={!!errors.email}
                  describedBy={
                    errors.email ? "demo-email-error demo-email-help" : "demo-email-help"
                  }
                  ref={emailRef}
                />
              </div>
              <FieldHelp id="demo-email-help">
                Where an answer would go. Nothing is sent from this form yet.
              </FieldHelp>
              {errors.email && <FieldError id="demo-email-error">{errors.email}</FieldError>}
            </Field>

            <Field reduced={reduced}>
              <FieldLabel htmlFor="demo-use-case">What you would use it for</FieldLabel>
              <div className="mt-2">
                <SelectField
                  id="demo-use-case"
                  name="use-case"
                  value={useCase}
                  onChange={(value) => {
                    setUseCase(value);
                    clear("useCase");
                  }}
                  onBlur={() => checkOnBlur("useCase")}
                  options={USE_CASE_OPTIONS}
                  placeholder="Choose one"
                  required
                  invalid={!!errors.useCase}
                  describedBy={errors.useCase ? "demo-use-case-error" : undefined}
                  ref={useCaseRef}
                />
              </div>
              {errors.useCase && <FieldError id="demo-use-case-error">{errors.useCase}</FieldError>}
            </Field>

            {/* Only once there is something for them to be about. A single paper
                has no programme committee and no submission count, and asking
                anyway is how a form teaches people to type "n/a". */}
            {venue && (
              <Field reduced={reduced}>
                <FieldLabel htmlFor="demo-organisation">
                  Conference, journal or group <Optional />
                </FieldLabel>
                <div className="mt-2">
                  <TextField
                    id="demo-organisation"
                    name="organisation"
                    value={organisation}
                    onChange={setOrganisation}
                    autoComplete="organization"
                    describedBy="demo-organisation-help"
                  />
                </div>
                <FieldHelp id="demo-organisation-help">
                  The name as it is published, if it has one.
                </FieldHelp>
              </Field>
            )}

            {venue && (
              <Field reduced={reduced}>
                <FieldLabel htmlFor="demo-volume">
                  Papers in a round, roughly <Optional />
                </FieldLabel>
                <div className="mt-2">
                  <SelectField
                    id="demo-volume"
                    name="volume"
                    value={volume}
                    onChange={(value) => setVolume((value || "unsure") as DemoVolume)}
                    options={VOLUME_OPTIONS}
                    describedBy="demo-volume-help"
                  />
                </div>
                <FieldHelp id="demo-volume-help">
                  It changes what is worth showing and nothing else.
                </FieldHelp>
              </Field>
            )}

            <Field reduced={reduced}>
              <FieldLabel htmlFor="demo-notes">
                What you want checked <Optional />
              </FieldLabel>
              <div className="mt-2">
                <TextAreaField
                  id="demo-notes"
                  name="notes"
                  value={notes}
                  onChange={setNotes}
                  rows={3}
                  maxLength={600}
                  placeholder="A results table we argued about last round"
                  describedBy="demo-notes-help"
                />
              </div>
              <FieldHelp id="demo-notes-help">
                One line is plenty. Name a paper, a table, or the check you are unsure residual can
                make.
              </FieldHelp>
            </Field>
          </FieldList>

          {errors.store && (
            <div className="mt-6">
              <FieldError id="demo-store-error">{errors.store}</FieldError>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-4 two:flex-row two:items-center">
            <SubmitControl busy={busy}>{busy ? "Recording" : "Request a demo"}</SubmitControl>
            <p
              className="max-w-[38ch]"
              style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--site-muted)" }}
            >
              Recorded in this browser. Nothing is sent, and no email goes anywhere yet.
            </p>
          </div>
        </fieldset>

        {/* The label on the control changes, which is silent to a screen reader
            on a button that already has focus. This says it out loud. */}
        <span role="status" aria-live="polite" className="sr-only">
          {busy ? "Recording the request" : ""}
        </span>
      </form>
    </Card>
  );
}

/**
 * The stack the fields sit in, staggered or not. Two trees rather than one tree
 * with conditional props, because the gate flips after the first render and
 * React reconciles a hydrated node on element type rather than on attributes.
 */
function FieldList({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  if (reduced) return <div className="flex flex-col gap-6">{children}</div>;
  return (
    <motion.div
      className="flex flex-col gap-6"
      variants={FIELD_LIST}
      initial="hidden"
      animate="shown"
    >
      {children}
    </motion.div>
  );
}

/** One field, staggered or not. The gate decides which, once, at the top. */
function Field({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  if (reduced) return <div>{children}</div>;
  return (
    <motion.div data-scrub="" data-reveal="" variants={FIELD_ITEM}>
      {children}
    </motion.div>
  );
}

/** Says a field can be left alone. Cheaper than marking the three that cannot. */
function Optional() {
  return <span style={{ fontWeight: 400, color: "var(--site-muted)" }}>(optional)</span>;
}

/* -------------------------------------------------------------------------- */
/* The confirmation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the success state is allowed to say.
 *
 * "We'll be in touch shortly" would be a lie: no email was sent, no queue
 * received anything, and nobody at residual knows this happened. So the first
 * sentence says where the request is, the two lists say what happened and what
 * did not, and the one route that reaches a person today is offered as a link
 * rather than implied by silence.
 *
 * The recorded values are printed back for the same reason a report prints the
 * numbers it compared: the person should be able to see exactly what is being
 * held, not take it on trust.
 *
 * **Focus moves from here, on mount, and not from the submit handler.** It used
 * to be `requestAnimationFrame(() => ref.current?.focus())` at the end of
 * `onSubmit`, which is the pattern `auth/submit-artifacts.tsx` also uses, and it
 * is intermittently wrong: React may not have committed this subtree by the time
 * that frame runs, so `ref.current` is null, the optional chain does nothing, and
 * focus stays on `<body>` with no announcement. It failed roughly one run in two
 * under Playwright, which is exactly the shape of bug that ships. An effect here
 * cannot run before the node exists.
 */
function Recorded({
  request,
  reduced,
  onAnother,
}: {
  request: DemoRequest;
  reduced: boolean;
  onAnother: () => void;
}) {
  const venue = asksAboutVenue(request.useCase);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const card = (
    <Card elevation="card" className="p-6 two:p-9">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="site-h3 outline-none"
        style={{ color: "var(--site-ink)" }}
      >
        Request recorded
      </h2>
      <p className="site-body mt-3 max-w-[58ch]">
        It is stored in this browser and nowhere else. No email was sent, nothing left this machine,
        and nobody at residual has been notified. This form has no service behind it yet, and it
        would rather say so than show you a confirmation it cannot support.
      </p>

      <dl className="mt-8 flex flex-col gap-4">
        <Row label="Name">{request.name}</Row>
        <Row label="Email">
          <span className="break-all">{request.email}</span>
        </Row>
        <Row label="Use case">{labelForUseCase(request.useCase)}</Row>
        {venue && request.organisation && <Row label="Organisation">{request.organisation}</Row>}
        {venue && <Row label="Papers in a round">{labelForVolume(request.volume)}</Row>}
        {request.notes && <Row label="To check">{request.notes}</Row>}
        <Row label="Recorded">{formatRequestedAt(request.requestedAt)}, in this browser</Row>
        <Row label="Not done">
          Sent, queued, emailed, or seen by anyone. Clearing this browser&rsquo;s site data deletes
          it.
        </Row>
      </dl>

      <div
        className="mt-8 pt-6"
        style={{ borderTop: "1px solid var(--site-line)" }}
      >
        <p className="site-body max-w-[58ch]">
          If you want an answer today, the project&rsquo;s GitHub is the one channel that reaches a
          person.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href="https://github.com/michae6345-crypto"
            className="inline-flex min-h-[48px] items-center px-6 py-3"
            style={{
              border: "1px solid var(--site-line-strong)",
              borderRadius: "var(--site-radius-pill)",
              color: "var(--site-ink)",
              fontSize: "15px",
              fontWeight: 500,
            }}
          >
            Open GitHub
          </a>
          <button
            type="button"
            onClick={onAnother}
            className="inline-flex min-h-[48px] items-center px-6 py-3 transition-colors"
            style={{
              border: "1px solid var(--site-line-strong)",
              borderRadius: "var(--site-radius-pill)",
              color: "var(--site-ink)",
              fontSize: "15px",
              fontWeight: 500,
              transitionDuration: "var(--dur-fast)",
            }}
          >
            Record another
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center underline underline-offset-4"
            style={{ fontSize: "15px", color: "var(--site-muted)" }}
          >
            What residual does
          </Link>
        </div>
      </div>
    </Card>
  );

  // The card that replaces the form arrives the way every other surface on this
  // page does: opacity, and 0.96 to 1. Nothing slides, nothing rotates.
  if (reduced) return card;
  return (
    <motion.div
      data-scrub=""
      data-reveal=""
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
    >
      {card}
    </motion.div>
  );
}

/** One row of the summary. A real `<dl>`, so it reads as pairs. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 two:flex-row two:gap-6">
      <dt className="shrink-0 two:w-[11rem]" style={{ fontSize: "14px", color: "var(--site-muted)" }}>
        {label}
      </dt>
      <dd style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-ink)" }}>{children}</dd>
    </div>
  );
}
