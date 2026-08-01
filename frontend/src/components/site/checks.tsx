import { checkFrom, findingFrom } from "@/components/site/corpus.server";
import { Container, Mono } from "@/components/site/ui";
import { Reveal } from "@/components/site/reveal";
import { SectionTag } from "@/components/site/section-tag";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";
import { VERDICT_LABEL } from "@/lib/verdict";

/**
 * What it checks today. Four, and the count is the count.
 *
 * The first two carry their own title and description out of
 * `src/fixtures/reports/1810.04805.json` rather than out of this file, because
 * those strings are the checker's `display_name` and `description` and they
 * should go stale here the moment they change there. The other two do not
 * appear in any committed report: `dead_links` and `citation_existence` need the
 * network, and the corpus runs without it. Their copy is written here, and the
 * section says as much rather than implying four checks were measured when two
 * were.
 *
 * The evidence card is the BERT finding, every field read from that same file.
 * Nothing on it is typed out here — not the claimed value, not the computed one,
 * not the delta, and not the locator, which reads `column "Average -"` because
 * that is the column header the paper actually prints.
 */

const BERT = "1810.04805";

const NETWORK_CHECKS = [
  {
    title: "Links resolve",
    description:
      "Every URL printed in the paper is requested, and the ones that no longer resolve are listed.",
  },
  {
    title: "Citations exist",
    description:
      "Every reference in the bibliography is looked up by identifier, never by title containment.",
  },
];

function CheckCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col items-start gap-4 p-8 three:p-10"
      style={{ background: "rgba(255,255,255,0.5)", borderRadius: "var(--site-radius-inner)" }}
    >
      <h3
        style={{
          fontSize: "clamp(18px, 1.6vw, 24px)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          lineHeight: 1.6,
          color: "var(--site-ink)",
        }}
      >
        {title}
      </h3>
      <p className="site-body">{description}</p>
      {children}
    </div>
  );
}

/** One label/value pair on the evidence card. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--site-muted)" }}>{label}</span>
      <span
        className="text-right"
        style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--site-ink)" }}
      >
        {children}
      </span>
    </div>
  );
}

export function Checks() {
  const bold = checkFrom(BERT, "bold_extreme");
  const average = checkFrom(BERT, "row_arithmetic");
  const finding = findingFrom(BERT, "row_arithmetic");

  return (
    <section id="checks" className="scroll-mt-20 py-14 three:py-[120px]">
      <Container>
        <SectionTag tag="The checks" heading="What it checks today" />

        <div className="mt-10 grid gap-6 three:mt-12 three:grid-cols-2 three:gap-10">
          {bold && (
            <Reveal>
              <CheckCard title={bold.display_name ?? ""} description={bold.description ?? ""} />
            </Reveal>
          )}

          {average && (
            <Reveal delay={0.05}>
              <CheckCard
                title={average.display_name ?? ""}
                description={average.description ?? ""}
              >
                {finding && (
                  <div
                    className="mt-2 flex w-full flex-col gap-2 p-5"
                    style={{ background: "var(--site-card)", borderRadius: "12px" }}
                  >
                    <Row label="Paper">
                      <Mono>{BERT}</Mono>, BERT
                    </Row>
                    <Row label="Source">
                      <Mono>{finding.anchor?.human_locator ?? ""}</Mono>
                    </Row>
                    <Row label="Claimed">
                      <Mono>{finding.claimed}</Mono>
                    </Row>
                    <Row label="Computed">
                      <Mono>{finding.computed}</Mono>
                    </Row>
                    <Row label="Delta">
                      <Mono>{finding.delta}</Mono>
                    </Row>
                    <Row label="Verdict">
                      <span className="inline-flex items-center gap-1.5">
                        <VerdictGlyph verdict={average.verdict} size={12} />
                        {VERDICT_LABEL[average.verdict]}
                      </span>
                    </Row>
                  </div>
                )}
              </CheckCard>
            </Reveal>
          )}

          {NETWORK_CHECKS.map((check, i) => (
            <Reveal key={check.title} delay={0.1 + i * 0.05}>
              <CheckCard title={check.title} description={check.description} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="site-body mt-8 max-w-[70ch]">
            The first two need nothing but the paper&rsquo;s own source, and every number quoted on
            this page comes from running them over the corpus with the network switched off. The
            last two request URLs and look up identifiers, so they are excluded from those figures
            rather than quietly folded into them.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
