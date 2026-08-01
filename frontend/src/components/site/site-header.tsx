import Link from "next/link";

const NAV = [
  { href: "#checks", label: "What it checks" },
  { href: "#mechanism", label: "How it works" },
  { href: "#limits", label: "What it cannot check" },
];

/**
 * The site's own header. The app's 56px `NavRail` does not appear on the
 * marketing route group, which is the whole reason the route group exists.
 *
 * The wordmark is set in the same mono the numbers are, at the same weight as
 * everything else, and carries no mark and no verdict colour (§3). `residual` is
 * lowercase everywhere, including here and at the start of a sentence.
 */
export function SiteHeader() {
  return (
    <header
      className="border-b"
      style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-base)" }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-6 px-4 py-3.5 two:px-10">
        <Link
          href="/"
          className="t-num"
          style={{ color: "var(--chrome-text)", fontSize: "14px", letterSpacing: "0.01em" }}
        >
          residual
        </Link>

        <nav className="ml-auto hidden items-center gap-7 two:flex" aria-label="Site">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="transition-colors"
              style={{
                color: "var(--chrome-dim)",
                fontSize: "14px",
                transitionDuration: "var(--dur-fast)",
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/check"
          className="ml-auto inline-flex items-center px-3.5 py-1.5 transition-colors two:ml-0"
          style={{
            color: "var(--chrome-text)",
            border: "1px solid var(--chrome-line)",
            borderRadius: "var(--radius-chip)",
            fontSize: "13px",
            transitionDuration: "var(--dur-fast)",
          }}
        >
          Check a paper
        </Link>
      </div>
    </header>
  );
}
