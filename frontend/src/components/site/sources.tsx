/**
 * The services the checker reads, not a logo wall of customers. It is a
 * different and more honest claim.
 *
 * Set as plain wordmarks rather than brand marks: these are other people's
 * trademarks and we are not endorsed by any of them. The list used to scroll
 * past on a marquee; it does not any more. DESIGN_PLAN.md allows the site one
 * moment of motion and spends it on the ledger, and a list that moves on its own
 * is a list that is harder to read.
 */

const SOURCES: { name: string; use: string; planned?: boolean }[] = [
  { name: "arXiv", use: "LaTeX source, one request every three seconds" },
  { name: "Crossref", use: "reference lookup" },
  { name: "OpenAlex", use: "reference lookup" },
  { name: "GitHub", use: "code repository candidates" },
  { name: "Hugging Face", use: "dataset and model cards", planned: true },
];

export function Sources() {
  return (
    <ul className="mt-12 grid gap-x-10 two:grid-cols-2 three:grid-cols-3">
      {SOURCES.map((source) => (
        <li
          key={source.name}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-3.5"
          style={{ borderColor: "var(--grid)" }}
        >
          <span style={{ color: "var(--ink)", fontSize: "16px" }}>{source.name}</span>
          <span
            className="t-num min-w-0 two:text-right"
            style={{ color: "var(--mark)", fontSize: "11px" }}
          >
            {source.planned ? "not built yet" : source.use}
          </span>
        </li>
      ))}
    </ul>
  );
}
