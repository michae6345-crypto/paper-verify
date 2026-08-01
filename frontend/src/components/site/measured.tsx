import {
  CELLS,
  CHECKS_CALLING_MODEL,
  CHECKS_TODAY,
  PAPERS,
  TABLES,
} from "@/components/site/corpus";
import { Container, Mono } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";

/**
 * The measured band: four rows, each a figure and the file it came from.
 *
 * Every number is bound from `corpus.ts` rather than typed here, which is the
 * whole point of that file existing — if the checker changes and the corpus
 * figures move, the CI corpus gate catches it and this page moves with them. A
 * `7,014` written into JSX would not.
 *
 * The reference gives this band no heading at all, and that is kept: four rows
 * of figure and provenance say what they are. It does get a heading for anything
 * that cannot see the layout, since the section is a nav target and a run of
 * four unlabelled rows is not one to arrive at.
 */

const ROWS: { label: string; source: string; value: string }[] = [
  { label: "Validation corpus", source: "fixtures/papers", value: `${PAPERS} papers` },
  { label: "Tables parsed", source: "fixtures/papers", value: `${TABLES} tables` },
  { label: "Cells read", source: "fixtures/papers", value: `${CELLS.toLocaleString("en-GB")} cells` },
  {
    label: "Checks that call a model",
    source: "backend/pv/checks",
    value: `${CHECKS_CALLING_MODEL} of ${CHECKS_TODAY}`,
  },
];

export function Measured() {
  return (
    <section id="measured" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <h2 className="sr-only">Measured</h2>
        <dl className="mx-auto flex w-full max-w-[1200px] flex-col">
          {ROWS.map((row, i) => (
            <Reveal key={row.label} delay={i * 0.05}>
              <div
                className="flex flex-col gap-2 border-b py-4 two:flex-row two:items-start two:gap-12"
                style={{ borderColor: "var(--site-line)" }}
              >
                <dt
                  className="two:flex-1"
                  style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-ink)" }}
                >
                  {row.label}
                </dt>
                <dd
                  className="two:flex-1"
                  style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-muted)" }}
                >
                  <Mono>{row.source}</Mono>
                </dd>
                <dd
                  className="two:flex-1"
                  style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--site-ink)" }}
                >
                  <Mono>{row.value}</Mono>
                </dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}
