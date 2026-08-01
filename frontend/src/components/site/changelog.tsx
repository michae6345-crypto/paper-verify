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
    <ul className="mt-10 flex flex-col">
      {ENTRIES.map((entry) => (
        <li
          key={entry.hash}
          className="grid gap-x-6 gap-y-2 border-t py-5 first:border-t-0 first:pt-0 two:grid-cols-[150px_1fr]"
          style={{ borderColor: "var(--chrome-line)" }}
        >
          <div className="flex items-baseline gap-3">
            <time className="t-num" style={{ color: "var(--chrome-dim)" }} dateTime={entry.date}>
              {entry.date}
            </time>
            <a
              href={`${REPO}/commit/${entry.hash}`}
              className="t-num transition-colors"
              style={{
                color: "var(--chrome-faint)",
                fontSize: "12px",
                transitionDuration: "var(--dur-fast)",
              }}
            >
              {entry.hash}
            </a>
          </div>
          <div>
            <p style={{ color: "var(--chrome-text)", fontSize: "15px", lineHeight: 1.5 }}>
              {entry.title}
            </p>
            <p
              className="mt-1.5 max-w-[70ch]"
              style={{ color: "var(--chrome-faint)", fontSize: "14px", lineHeight: 1.55 }}
            >
              {entry.note}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
