import { CELLS, FALSE_FINDINGS, PAPERS, TABLES, TESTS } from "./corpus";
import styles from "./site.module.css";

/**
 * §16 §7. Digits roll into place; nothing counts up. A counter that ticks from
 * zero to 7,034 displays 7,033 numbers that were never measured, which on this
 * site is not a small thing.
 *
 * §16 names "claims in the database" as one of the counters. There is no claims
 * database — `Claim` is declared in the contract and has no call sites — so it
 * is not on the wall. The five below are all measurable today.
 *
 * CSS-only, so it runs without JavaScript and stops under
 * `prefers-reduced-motion` (see site.module.css).
 */

function Odometer({ value }: { value: string }) {
  return (
    <span className="t-num" style={{ fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.1 }}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {value.split("").map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            className={styles.digit}
            style={{ animationDelay: `${i * 45}ms` }}
          >
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}

const STATS: { value: string; label: string; source: string }[] = [
  { value: String(PAPERS), label: "papers in the validation corpus", source: "fixtures/papers/" },
  { value: String(TABLES), label: "tables holding data", source: "parsed, nested tabulars excluded" },
  { value: CELLS.toLocaleString("en-US"), label: "cells parsed", source: "across all 113 tabulars" },
  { value: String(TESTS), label: "tests, none touching the network", source: "pytest --collect-only" },
  {
    value: String(FALSE_FINDINGS),
    label: "findings the ground truth says we should not have made",
    source: "fixtures/GROUND_TRUTH.md",
  },
];

export function Stats() {
  return (
    <div className="mt-10 grid gap-px two:grid-cols-2 three:grid-cols-5" style={{ background: "var(--chrome-line)" }}>
      {STATS.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col justify-between gap-4 p-5"
          style={{ background: "var(--chrome-base)" }}
        >
          <Odometer value={stat.value} />
          <div>
            <p style={{ color: "var(--chrome-dim)", fontSize: "14px", lineHeight: 1.45 }}>
              {stat.label}
            </p>
            <p className="mt-1.5 t-num" style={{ color: "var(--chrome-faint)", fontSize: "11px" }}>
              {stat.source}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
