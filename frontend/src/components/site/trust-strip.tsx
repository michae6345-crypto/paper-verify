import styles from "./site.module.css";

/**
 * §16 §2. A list of the services the checker reads, not a logo wall of
 * customers. It is a different and more honest claim.
 *
 * Set as wordmarks in `--chrome-faint` rather than as brand marks: these are
 * other people's trademarks and we are not endorsed by any of them. No colour on
 * hover, per §16. Hover pauses the scroll so the list can be read.
 */

const SOURCES: { name: string; use: string; planned?: boolean }[] = [
  { name: "arXiv", use: "LaTeX source, one request per three seconds" },
  { name: "Crossref", use: "reference lookup" },
  { name: "OpenAlex", use: "reference lookup" },
  { name: "GitHub", use: "code repository candidates" },
  { name: "Hugging Face", use: "dataset and model cards", planned: true },
];

function Item({ source }: { source: (typeof SOURCES)[number] }) {
  return (
    <span className="flex shrink-0 items-baseline gap-2 px-6">
      <span
        className="font-medium whitespace-nowrap"
        style={{ color: "var(--chrome-dim)", fontSize: "15px" }}
      >
        {source.name}
      </span>
      <span className="whitespace-nowrap" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
        {source.planned ? "not built yet" : source.use}
      </span>
    </span>
  );
}

export function TrustStrip() {
  return (
    <section
      className="border-b py-6"
      style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-panel)" }}
    >
      <div className="px-5 two:px-8">
        <div className="mx-auto w-full max-w-[1080px]">
          <p className="t-label">Sources the checker reads</p>
        </div>
      </div>

      <div
        className={`${styles.marqueeViewport} mt-4 overflow-hidden`}
        role="list"
        aria-label="Sources the checker reads"
      >
        <div className={styles.marqueeTrack}>
          {SOURCES.map((s) => (
            <span key={s.name} role="listitem">
              <Item source={s} />
            </span>
          ))}
          {/* Second copy: the seam the -50% keyframe lands on. Duplicated content,
              so it is hidden from assistive technology. */}
          <span aria-hidden="true" className="flex motion-reduce:hidden">
            {SOURCES.map((s) => (
              <Item key={`${s.name}-echo`} source={s} />
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
