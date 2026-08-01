import Link from "next/link";

const NAV = [
  { href: "#mechanism", label: "How it works" },
  { href: "#honesty", label: "What it cannot check" },
  { href: "#faq", label: "FAQ" },
];

/**
 * The site's own header. The app's 56px `NavRail` does not appear on the
 * marketing route group. That is the whole reason §16 asks for a route group.
 *
 * The wordmark never carries a verdict colour (§3).
 */
export function SiteHeader() {
  return (
    <header
      className="border-b"
      style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-base)" }}
    >
      <div className="mx-auto flex w-full max-w-[1144px] items-center gap-6 px-5 py-3 two:px-8">
        <Link
          href="/"
          className="flex items-baseline gap-2 t-num"
          style={{ color: "var(--chrome-text)", fontSize: "13px", fontWeight: 500 }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center border"
            style={{ borderColor: "var(--chrome-line)", borderRadius: "var(--radius-chip)" }}
          >
            pv
          </span>
          <span className="hidden two:inline">paper-verify</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-5 two:flex" aria-label="Site">
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
          className="ml-auto inline-flex items-center px-3 py-1.5 font-medium transition-colors two:ml-0"
          style={{
            background: "var(--chrome-raised)",
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
