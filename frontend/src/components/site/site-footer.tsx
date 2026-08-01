import Link from "next/link";

const REPO = "https://github.com/michae6345-crypto/paper-verify";

/**
 * §16 §9. Status, GitHub, docs, contact.
 *
 * The status line states what is actually true of the deployment. No green dot.
 * Contact goes to the issue tracker, not to a person's inbox.
 */

const COLUMNS: { heading: string; links: { href: string; label: string; external?: boolean }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { href: "/check", label: "Check a paper" },
        { href: "/reports/1810.04805", label: "A finished report" },
      ],
    },
    {
      heading: "Docs",
      links: [
        { href: `${REPO}/blob/master/docs/BRIEF.md`, label: "Design and build brief", external: true },
        { href: `${REPO}/blob/master/docs/ARCHITECTURE.md`, label: "Architecture", external: true },
        {
          href: `${REPO}/blob/master/fixtures/GROUND_TRUTH.md`,
          label: "Ground truth for the corpus",
          external: true,
        },
      ],
    },
    {
      heading: "Project",
      links: [
        { href: REPO, label: "GitHub", external: true },
        { href: `${REPO}/issues`, label: "Report something we got wrong", external: true },
      ],
    },
  ];

export function SiteFooter() {
  return (
    <footer
      className="px-4 py-14 two:px-10"
      style={{ background: "var(--chrome-panel)" }}
    >
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 three:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="t-num" style={{ color: "var(--chrome-text)", fontSize: "14px" }}>
            residual
          </p>
          <p
            className="mt-2 max-w-[44ch]"
            style={{ color: "var(--chrome-faint)", fontSize: "13px", lineHeight: 1.6 }}
          >
            A residual is the difference between an observed value and a predicted one, which is
            what this computes.
          </p>
          <p
            className="mt-3 max-w-[44ch]"
            style={{ color: "var(--chrome-faint)", fontSize: "13px", lineHeight: 1.6 }}
          >
            residual checks whether an ML paper&rsquo;s own numbers agree with each other, and
            reports discrepancies with evidence. It does not judge whether a paper is good, novel,
            or true.
          </p>

          <div
            className="mt-5 border-t pt-4"
            style={{ borderColor: "var(--chrome-line)" }}
          >
            <p className="t-label">Status</p>
            <p
              className="mt-2 max-w-[44ch]"
              style={{ color: "var(--chrome-faint)", fontSize: "13px", lineHeight: 1.6 }}
            >
              In development. Four of the seven specified checks are implemented and validated
              against the corpus. Runs are held in
              memory, so they do not survive a restart and permalinks are not durable yet.
            </p>
          </div>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <p className="t-label">{column.heading}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      className="transition-colors"
                      style={{
                        color: "var(--chrome-dim)",
                        fontSize: "13px",
                        transitionDuration: "var(--dur-fast)",
                      }}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="transition-colors"
                      style={{
                        color: "var(--chrome-dim)",
                        fontSize: "13px",
                        transitionDuration: "var(--dur-fast)",
                      }}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
