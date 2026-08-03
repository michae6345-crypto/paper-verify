"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { signOut } from "@/components/auth/session";
import { useIsHydrated, useSession } from "@/components/auth/use-session";

/**
 * The right-hand side of the bar. It reports the fake session and nothing more.
 *
 * The email is shown so it is obvious which identity the browser is currently
 * claiming — which matters more here than it would with real auth, because that
 * identity was asserted rather than proved and the user may well be someone
 * else's for testing.
 *
 * Before hydration there is no way to know whether a session exists, so the
 * links render and the identity slot stays empty rather than flashing "sign in"
 * at somebody who is already signed in.
 */

const LINKS = [
  { href: "/submit", label: "Submit" },
  { href: "/account", label: "Account" },
];

export function AuthNav() {
  const session = useSession();
  const hydrated = useIsHydrated();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav aria-label="Account" className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {LINKS.map((link) => {
        const current = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className="flex h-11 items-center px-4 transition-colors"
            style={{
              borderRadius: "var(--site-radius-pill)",
              background: current ? "var(--site-card)" : "transparent",
              color: "var(--site-ink)",
              fontSize: "15px",
              fontWeight: current ? 600 : 500,
              transitionDuration: "var(--dur-fast)",
            }}
          >
            {link.label}
          </Link>
        );
      })}

      {!hydrated ? null : session ? (
        <span className="flex items-center gap-2">
          <span
            className="site-mono max-w-[24ch] truncate px-4 py-2"
            style={{
              background: "var(--site-card)",
              borderRadius: "var(--site-radius-pill)",
              fontSize: "13px",
              color: "var(--site-ink)",
            }}
            title={session.email}
          >
            {session.email}
          </span>
          <button
            type="button"
            onClick={() => {
              signOut();
              router.push("/login");
            }}
            className="flex h-11 items-center px-4 transition-colors"
            style={{
              border: "1px solid var(--site-line-strong)",
              borderRadius: "var(--site-radius-pill)",
              color: "var(--site-ink)",
              fontSize: "15px",
              fontWeight: 500,
              transitionDuration: "var(--dur-fast)",
            }}
          >
            Sign out
          </button>
        </span>
      ) : (
        <Link
          href="/login"
          className="flex h-11 items-center px-6 transition-colors"
          style={{
            background: "var(--site-ink)",
            borderRadius: "var(--site-radius-pill)",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            transitionDuration: "var(--dur-fast)",
          }}
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
