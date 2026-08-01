/**
 * §16 §6. The four most recent entries, dated.
 *
 * These are real commits on `master`, recorded here rather than read from git at
 * build time. Vercel builds from a shallow clone, and a changelog that silently
 * empties itself in production is worse than one that is edited by hand. Each
 * row carries its short hash, so `git show <hash>` is the whole verification
 * story.
 */

const REPO = "https://github.com/michae6345-crypto/paper-verify";

const ENTRIES: { hash: string; date: string; title: string; note: string }[] = [
  {
    hash: "f689070",
    date: "2026-08-01",
    title: "Architecture spec, content addressing, and the CI corpus gate",
    note: "Regenerating the corpus reports now fails the build if any finding changed. This is the defence against a checker being quietly improved into different accusations.",
  },
  {
    hash: "7d39a78",
    date: "2026-08-01",
    title: "Vercel project config for the frontend",
    note: "Security headers and the build command pinned in vercel.json.",
  },
  {
    hash: "0757bb0",
    date: "2026-08-01",
    title: "Deployment config, README, and corpus provenance",
    note: "Attribution and licensing for all ten papers in the validation corpus.",
  },
  {
    hash: "eea0b4a",
    date: "2026-08-01",
    title: "The margin gutter, the document pane it aligns to, and §5.4",
    note: "Verdict marks now sit in the margin against the exact cell they refer to, the way a proofreader's marks sit in a manuscript.",
  },
];

export function Changelog() {
  return (
    <ul className="mt-12 flex flex-col">
      {ENTRIES.map((entry) => (
        <li
          key={entry.hash}
          className="grid gap-x-8 gap-y-2 border-t py-5 two:grid-cols-[160px_minmax(0,1fr)]"
          style={{ borderColor: "var(--grid)" }}
        >
          <div className="flex items-baseline gap-3">
            <time className="t-num" style={{ color: "var(--ink-dim)" }} dateTime={entry.date}>
              {entry.date}
            </time>
            <a
              href={`${REPO}/commit/${entry.hash}`}
              className="t-num underline underline-offset-4"
              style={{
                color: "var(--ink-dim)",
                textDecorationColor: "var(--grid)",
                fontSize: "12px",
              }}
            >
              {entry.hash}
            </a>
          </div>
          <div>
            <p style={{ color: "var(--ink)", fontSize: "16px", lineHeight: 1.5 }}>{entry.title}</p>
            <p
              className="mt-2 max-w-[68ch]"
              style={{ color: "var(--ink-dim)", fontSize: "14px", lineHeight: 1.6 }}
            >
              {entry.note}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
