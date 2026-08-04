"use client";

import { useRef } from "react";

import { useSectionProgress } from "@/components/site/motion/scrub";
import { Arrive } from "@/components/site/motion/mobile";
import { Card, Mono } from "@/components/site/ui";
import { VerdictGlyph } from "@/components/verdict/verdict-glyph";

/**
 * Why a check declines.
 *
 * The four codes are `ReasonCode` in `backend/pv/models.py`, spelled exactly as
 * the enum spells them, because they are what a report prints and a reader who
 * meets one in a report should recognise it here. They are four of about
 * sixteen, and the lead line says so rather than implying the enum has four
 * members.
 *
 * What changed is the depth. Each description used to be a single clause naming
 * the situation; each one now says what makes the situation undecidable, which
 * is the part that carries the argument. "Two or more bold values in one block"
 * is a fact about a table. "So there is no single best one for the bolding to be
 * claiming" is the reason a deterministic checker has nothing to compute, and
 * that is what this card exists to say.
 *
 * The foot line is the half of the rule that is easy to lose: declining is not
 * dropping the case. The comparison stays in the report with both numbers on it,
 * so the reader sees exactly what was compared. The verdict is the only thing
 * withheld.
 *
 * **Layout.** A single full-width band rather than the left column of a
 * two-column split. The section around it now opens with three columns of
 * running text on the page field, so a dark panel across the full measure is the
 * change of plane the section needs at that point, and it lets the four codes
 * sit as four columns instead of a stacked list of small print. At `two:` they
 * fall to a 2x2 and below that they stack.
 *
 * **Motion.** The panel arrives as a surface, then the four codes in reading
 * order, then each code's mark. That last one is the detail worth having: the
 * glyph is a proofreader's query and it lands *after* the line it belongs to,
 * the way a mark is made on a page that has already been read. The windows
 * overlap heavily, so a reader who flicks past gets all four rather than a
 * queue, and one who scrolls back runs them out again.
 *
 * Not pinned. The panel plus the section's other three bands is several screens
 * of content, and a pinned section whose contents exceed the screen puts its own
 * lower half out of reach.
 */

const REASONS: { code: string; description: string }[] = [
  {
    code: "multiple_bold_in_column",
    description:
      "Two or more values are bold inside the same rule-delimited block, so there is no single best one for the bolding to be claiming.",
  },
  {
    code: "metric_direction_unknown",
    description:
      "No arrow in the column header and no entry in the direction table, so whether higher or lower is better would have to be assumed.",
  },
  {
    code: "cell_spans_columns",
    description:
      "The value sits in a cell spanning several columns, so it belongs to no one of them and there is no column for it to be the best of.",
  },
  {
    code: "average_denominator_ambiguous",
    description:
      "More than one reading of the row reproduces the printed average, and a weighting that is not on the page would reproduce it too.",
  },
];

/**
 * Where the four codes open in the panel's own travel, and the gap between them.
 *
 * The panel is its own track, so progress 0 is the frame its top edge reaches
 * the fold and 0.5 is its centre at the centre of the screen, at every viewport.
 * The codes sit about 200px down a panel around 380px tall, which at a 720px
 * viewport is 0.18 of a 1100px travel, and 0.30 is 330px of scrolling. 0.03
 * between one and the next is around 33px, far enough apart to read them in
 * order and still a nine tenths overlap, so a fast scroll compresses the four
 * into one gesture.
 */
const CODE_START = 0.18;
const CODE_SPAN = 0.3;
const CODE_STEP = 0.03;

/** The mark lands after the line it belongs to, and takes less time doing it. */
const MARK_LAG = 0.1;
const MARK_SPAN = 0.14;

export function DecidesReasons() {
  const panel = useRef<HTMLDivElement>(null);
  const progress = useSectionProgress(panel);

  return (
    <div ref={panel} className="site-stack">
      <Arrive progress={progress} from={0} to={0.3} kind="surface" y={12} scale={[0.96, 1]} lift="card">
        {/* `elevation="none"`, because the shadow is on the scrubbed layer above
            and arrives with the panel instead of being there from the first
            frame. The prop writes an inline `box-shadow`, so leaving it set
            would put two of them on one surface. */}
        <Card
          tone="dark"
          elevation="none"
          className="flex flex-col gap-8 p-6 two:gap-10 two:p-8 three:p-12"
        >
          <div className="flex flex-col gap-3 three:flex-row three:items-baseline three:gap-12">
            <h3
              className="shrink-0"
              style={{
                fontSize: "clamp(20px, 1.8vw, 26px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.4,
                color: "#ffffff",
              }}
            >
              Why a check declines
            </h3>
            <p
              className="max-w-[70ch]"
              style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}
            >
              Four of the reason codes in <Mono>backend/pv/models.py</Mono>. A report carrying a lot
              of these is a report doing its job: each one names a specific thing about a specific
              table that no arithmetic can settle.
            </p>
          </div>

          <ul className="grid gap-8 two:grid-cols-2 two:gap-10 three:grid-cols-4">
            {REASONS.map((reason, i) => {
              const from = CODE_START + i * CODE_STEP;
              return (
                // The Arrive sits inside the `li` rather than around it: a `div`
                // between `ul` and `li` is not a list any more.
                <li key={reason.code}>
                  <Arrive
                    progress={progress}
                    from={from}
                    to={from + CODE_SPAN}
                    lead={i * 0.03}
                    y={14}
                    className="flex flex-col gap-2"
                  >
                    {/* No blur. Text resolving out of a blur reads as a font
                        failing to load, and §4 of the teardown spends that
                        effect once, on the one element that matters, which on
                        this page is the hero's verdict. */}
                    <Arrive
                      progress={progress}
                      from={from + MARK_LAG}
                      to={from + MARK_LAG + MARK_SPAN}
                      lead={i * 0.03 + MARK_LAG}
                      y={0}
                      className="flex"
                    >
                      <VerdictGlyph verdict="unverifiable" size={14} />
                    </Arrive>
                    <p
                      className="site-mono"
                      style={{ fontSize: "14px", lineHeight: 1.5, color: "#ffffff" }}
                    >
                      {reason.code}
                    </p>
                    <p
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "var(--site-muted-invert)",
                      }}
                    >
                      {reason.description}
                    </p>
                  </Arrive>
                </li>
              );
            })}
          </ul>

          <p
            className="max-w-[80ch]"
            style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--site-muted-invert)" }}
          >
            In all four the comparison stays in the report with both numbers attached, so a reader
            still sees what was measured against what. The verdict is the only thing withheld.
          </p>
        </Card>
      </Arrive>
    </div>
  );
}
