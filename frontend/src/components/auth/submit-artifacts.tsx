"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  ChoiceGroup,
  FieldError,
  FieldHelp,
  FieldLabel,
  GhostButton,
  Panel,
  PrimaryButton,
  TextArea,
  TextInput,
} from "@/components/auth/controls";
import { RecordId } from "@/components/auth/record-id";
import {
  addSubmission,
  newRecordId,
  type PaperKind,
  type RuntimeKind,
  type Submission,
} from "@/components/auth/session";
import { useIsHydrated, useSession } from "@/components/auth/use-session";
import { parseArxivId } from "@/lib/arxiv";

/**
 * The artifact form: the paper, the repository, and how the work is run.
 *
 * The three fields are the three things a conference would be sent, which is the
 * point of the screen. What matters more than the fields is the line between
 * them: **the paper is checked, the rest is recorded**. residual does not clone
 * the repository, does not pull the image and does not execute the command, and
 * the form says so beside the fields that collect them rather than in a
 * footnote. Collecting an artifact is not a promise to run it, but a form that
 * asks for a container image without saying what it does with it is making that
 * promise on the product's behalf.
 *
 * The upload path is the same shape of honesty. There is no backend to receive a
 * file, so the file is never read and never leaves the machine; the record keeps
 * the filename so the submission is legible, and the field says that where the
 * user can see it before choosing.
 */

const PAPER_OPTIONS = [
  { value: "arxiv" as const, label: "arXiv ID" },
  { value: "upload" as const, label: "Upload the paper" },
];

const RUNTIME_OPTIONS = [
  { value: "image" as const, label: "Container image" },
  { value: "command" as const, label: "Command" },
  { value: "unspecified" as const, label: "Not decided yet" },
];

type Errors = Partial<Record<"paper" | "repo" | "runtime" | "store", string>>;

/**
 * A repository URL has to be an absolute http(s) URL. Anything else — an SSH
 * remote, a bare `github.com/x/y`, a local path — is something a reviewer cannot
 * open from the record, which is the only thing the field is for.
 */
function repoProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter the repository URL. It goes on the record beside the paper.";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `"${value}" is not a URL. Paste the address you would open in a browser, starting with https://.`;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `${url.protocol.replace(":", "")} links do not open from a record. Use the https:// address of the repository.`;
  }
  return null;
}

export function SubmitArtifacts({ knownIds }: { knownIds: string[] }) {
  const router = useRouter();
  const session = useSession();
  const hydrated = useIsHydrated();

  const [paperKind, setPaperKind] = useState<PaperKind>("arxiv");
  const [arxiv, setArxiv] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind>("image");
  const [runtime, setRuntime] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [recorded, setRecorded] = useState<Submission | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // Whether there is a session is unknowable until `localStorage` is readable,
  // so the screen holds for that one frame. Rendering the form first and
  // swapping it for the sign-in prompt would flash a form the user cannot use.
  if (!hydrated) {
    return <div className="min-h-[560px]" />;
  }

  // Signed out is a real state here, not a failure: there is nothing to protect,
  // but a record needs an address on it.
  if (!session) {
    return (
      <Panel as="section">
        <h2 className="site-h3">Sign in first</h2>
        <p className="site-body mt-2 max-w-[60ch]">
          A submission is recorded against an email address, so there has to be one. No password is
          involved and any address works.
        </p>
        <div className="mt-6">
          <Link
            href="/login?next=%2Fsubmit"
            className="site-lift inline-flex items-center px-7 py-3.5"
            style={{
              background: "var(--site-ink)",
              color: "#ffffff",
              borderRadius: "var(--site-radius-pill)",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            Sign in
          </Link>
        </div>
      </Panel>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const next: Errors = {};
    let arxivId: string | null = null;

    if (paperKind === "arxiv") {
      arxivId = parseArxivId(arxiv);
      if (!arxivId) {
        next.paper = arxiv.trim()
          ? `"${arxiv.trim()}" is not an arXiv ID. It looks like 1706.03762, and the abs or pdf URL works too.`
          : "Enter the arXiv ID of the paper, or switch to upload.";
      }
    } else if (!uploadName) {
      next.paper = "Choose the file to record. Nothing is uploaded; only the name is kept.";
    }

    const repoError = repoProblem(repoUrl);
    if (repoError) next.repo = repoError;

    if (runtimeKind !== "unspecified" && !runtime.trim()) {
      next.runtime =
        runtimeKind === "image"
          ? "Enter the image reference, or switch to not decided yet."
          : "Enter the command, or switch to not decided yet.";
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const submission: Submission = {
      id: newRecordId(),
      email: session.email,
      paperKind,
      arxivId,
      uploadName: paperKind === "upload" ? uploadName : null,
      repoUrl: repoUrl.trim(),
      runtimeKind,
      runtime: runtimeKind === "unspecified" ? "" : runtime.trim(),
      submittedAt: new Date().toISOString(),
    };

    if (!addSubmission(submission)) {
      setErrors({
        store:
          "This browser refused to store the record, which private browsing and blocked site data both do. The submission was not kept. Try a normal window.",
      });
      return;
    }

    setErrors({});
    setRecorded(submission);
    // The form is replaced by the confirmation, so focus has to follow it or a
    // keyboard user is left on a button that no longer exists.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (recorded) {
    const hasReport = !!recorded.arxivId && knownIds.includes(recorded.arxivId);
    return (
      <Panel as="section">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="site-h3 outline-none"
          style={{ color: "var(--site-ink)" }}
        >
          Submission recorded
        </h2>
        <p className="site-body mt-2 max-w-[62ch]">
          This is the verification record. Send it to the conference with the paper and the
          repository.
        </p>

        <div className="mt-6">
          <RecordId id={recorded.id} size="large" />
        </div>

        <dl className="mt-8 flex flex-col gap-4">
          <Row label="Paper">
            {recorded.arxivId ? (
              <span className="site-mono">{recorded.arxivId}</span>
            ) : (
              <span className="site-mono">{recorded.uploadName}</span>
            )}
          </Row>
          <Row label="Repository">
            <span className="site-mono break-all">{recorded.repoUrl}</span>
          </Row>
          <Row label="How it runs">
            {recorded.runtimeKind === "unspecified" ? (
              <span style={{ color: "var(--site-muted)" }}>Not given</span>
            ) : (
              <span className="site-mono break-all">{recorded.runtime}</span>
            )}
          </Row>
          <Row label="Checked">
            {hasReport
              ? "The paper's LaTeX source. Open the report below."
              : recorded.arxivId
                ? "Nothing yet. This build checks papers already in its corpus, and it holds no report for this ID."
                : "Nothing. Uploads are recorded, not read."}
          </Row>
          <Row label="Not run">
            The repository and the run instructions. residual does not clone, pull or execute
            anything.
          </Row>
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {hasReport && (
            <Link
              href={`/runs/${recorded.arxivId}`}
              className="site-lift inline-flex items-center px-7 py-3.5"
              style={{
                background: "var(--site-ink)",
                color: "#ffffff",
                borderRadius: "var(--site-radius-pill)",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              Open the report
            </Link>
          )}
          <GhostButton onClick={() => router.push("/account")}>See all submissions</GhostButton>
          <GhostButton
            onClick={() => {
              setRecorded(null);
              setArxiv("");
              setUploadName(null);
              setRepoUrl("");
              setRuntime("");
            }}
          >
            Submit another
          </GhostButton>
        </div>
      </Panel>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Panel as="section">
        <h2 className="site-h3">The paper</h2>
        <div className="mt-4">
          <ChoiceGroup
            legend="How the paper arrives"
            name="paper-kind"
            value={paperKind}
            onChange={(value) => {
              setPaperKind(value);
              setErrors((prev) => ({ ...prev, paper: undefined }));
            }}
            options={PAPER_OPTIONS}
          />
        </div>

        {paperKind === "arxiv" ? (
          <div className="mt-6">
            <FieldLabel htmlFor="arxiv">arXiv ID</FieldLabel>
            <div className="mt-2">
              <TextInput
                id="arxiv"
                name="arxiv"
                value={arxiv}
                onChange={(value) => {
                  setArxiv(value);
                  setErrors((prev) => ({ ...prev, paper: undefined }));
                }}
                placeholder="1706.03762"
                mono
                invalid={!!errors.paper}
                describedBy={errors.paper ? "arxiv-error arxiv-help" : "arxiv-help"}
              />
            </div>
            <FieldHelp id="arxiv-help">
              The abs or pdf URL works too. residual fetches the LaTeX source from arXiv, not the
              PDF, because the checks read the tables and the macros that build them.
            </FieldHelp>
            {errors.paper && <FieldError id="arxiv-error">{errors.paper}</FieldError>}
          </div>
        ) : (
          <div className="mt-6">
            <FieldLabel htmlFor="upload">Paper file</FieldLabel>
            <div className="mt-2">
              <input
                id="upload"
                name="upload"
                type="file"
                accept=".pdf,.tex,.zip,.gz,.tar,.tgz"
                onChange={(event) => {
                  setUploadName(event.target.files?.[0]?.name ?? null);
                  setErrors((prev) => ({ ...prev, paper: undefined }));
                }}
                aria-invalid={errors.paper ? true : undefined}
                aria-describedby={errors.paper ? "upload-error upload-help" : "upload-help"}
                className="block w-full cursor-pointer text-[15px] text-[var(--site-ink)] file:mr-4 file:cursor-pointer file:rounded-full file:border file:border-[var(--site-line-strong)] file:bg-[var(--site-card)] file:px-5 file:py-2.5 file:text-[15px] file:font-medium file:text-[var(--site-ink)]"
              />
            </div>
            <FieldHelp id="upload-help">
              The file stays on this machine. There is no upload endpoint yet, so residual records
              the filename and reads nothing. Use the arXiv ID if you want the checks to run.
            </FieldHelp>
            {errors.paper && <FieldError id="upload-error">{errors.paper}</FieldError>}
          </div>
        )}
      </Panel>

      <Panel as="section">
        <h2 className="site-h3">The repository</h2>
        <div className="mt-6">
          <FieldLabel htmlFor="repo">Repository URL</FieldLabel>
          <div className="mt-2">
            <TextInput
              id="repo"
              name="repo"
              type="url"
              inputMode="url"
              value={repoUrl}
              onChange={(value) => {
                setRepoUrl(value);
                setErrors((prev) => ({ ...prev, repo: undefined }));
              }}
              placeholder="https://github.com/org/repo"
              mono
              invalid={!!errors.repo}
              describedBy={errors.repo ? "repo-error repo-help" : "repo-help"}
            />
          </div>
          <FieldHelp id="repo-help">
            Recorded on the verification record so a reviewer can open it. residual does not clone
            it and does not read it.
          </FieldHelp>
          {errors.repo && <FieldError id="repo-error">{errors.repo}</FieldError>}
        </div>
      </Panel>

      <Panel as="section">
        <h2 className="site-h3">How it runs</h2>
        <p className="site-body mt-2 max-w-[62ch]">
          This is collected so the record carries it and a reviewer can run it themselves. residual
          does not pull the image or execute the command.
        </p>

        <div className="mt-6">
          <ChoiceGroup
            legend="What you can give"
            name="runtime-kind"
            value={runtimeKind}
            onChange={(value) => {
              setRuntimeKind(value);
              setErrors((prev) => ({ ...prev, runtime: undefined }));
            }}
            options={RUNTIME_OPTIONS}
          />
        </div>

        {runtimeKind !== "unspecified" && (
          <div className="mt-6">
            <FieldLabel htmlFor="runtime">
              {runtimeKind === "image" ? "Container image" : "Command"}
            </FieldLabel>
            <div className="mt-2">
              {runtimeKind === "image" ? (
                <TextInput
                  id="runtime"
                  name="runtime"
                  value={runtime}
                  onChange={(value) => {
                    setRuntime(value);
                    setErrors((prev) => ({ ...prev, runtime: undefined }));
                  }}
                  placeholder="ghcr.io/org/repo:v1.2.0"
                  mono
                  invalid={!!errors.runtime}
                  describedBy={errors.runtime ? "runtime-error runtime-help" : "runtime-help"}
                />
              ) : (
                <TextArea
                  id="runtime"
                  name="runtime"
                  value={runtime}
                  onChange={(value) => {
                    setRuntime(value);
                    setErrors((prev) => ({ ...prev, runtime: undefined }));
                  }}
                  placeholder={"python train.py --config configs/base.yaml\npython eval.py --ckpt out/final.pt"}
                  rows={4}
                  invalid={!!errors.runtime}
                  describedBy={errors.runtime ? "runtime-error runtime-help" : "runtime-help"}
                />
              )}
            </div>
            <FieldHelp id="runtime-help">
              {runtimeKind === "image"
                ? "A pinned tag or digest is more use to a reviewer than latest."
                : "The commands that reproduce the numbers in the paper, in order."}
            </FieldHelp>
            {errors.runtime && <FieldError id="runtime-error">{errors.runtime}</FieldError>}
          </div>
        )}
      </Panel>

      {errors.store && (
        <Panel as="section">
          <FieldError id="store-error">{errors.store}</FieldError>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <PrimaryButton>Submit and issue a record</PrimaryButton>
        <span style={{ fontSize: "14px", color: "var(--site-muted)" }}>
          The record is issued immediately. Nothing is sent anywhere.
        </span>
      </div>
    </form>
  );
}

/** One row of the confirmation summary. A real `<dl>`, so it reads as pairs. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 two:flex-row two:gap-6">
      <dt
        className="shrink-0 two:w-[9rem]"
        style={{ fontSize: "14px", color: "var(--site-muted)" }}
      >
        {label}
      </dt>
      <dd style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-ink)" }}>{children}</dd>
    </div>
  );
}
