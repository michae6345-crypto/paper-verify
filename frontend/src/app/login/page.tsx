import type { Metadata } from "next";
import { Suspense } from "react";

import { Measure, PageHead } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in — residual",
  description: "Create a session so submissions and verification records have somewhere to sit.",
};

/**
 * §5: sign in. One field.
 *
 * `LoginForm` reads `?next=`, which puts it behind `useSearchParams` and so
 * behind a Suspense boundary — without one, Next opts the whole route into
 * dynamic rendering at build time. The fallback is the panel's own height so
 * nothing jumps.
 */
export default function LoginPage() {
  return (
    <Measure>
      <PageHead
        eyebrow="Step one of four"
        title="Sign in"
        lede="An account gives your submissions and their verification records somewhere to live. Submit a paper, residual checks it, and you send the record on to the conference with the paper and the repository."
      />

      <Suspense fallback={<div className="min-h-[280px]" />}>
        <LoginForm />
      </Suspense>
    </Measure>
  );
}
