"use client";

import type { MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";

import { DrawLine } from "@/components/site/motion/scrub";
import { Arrive, Rise, WIDE, useOwnTrack, useWideLayout } from "@/components/site/motion/mobile";
import { Reveal } from "@/components/site/reveal";
import { Mono, Tag } from "@/components/site/ui";

/**
 * Where the checks go next, and the reason every line of it is written in the
 * future tense.
 *
 * The section above this one says what runs. This one says what it is designed
 * to run, and the two have to be impossible to confuse. The page used to carry
 * a separate roadmap section whose closing paragraph disowned everything above
 * it; that section is gone, so the disclaiming is done inline instead, three
 * times over and in three different registers:
 *
 *   1. the band's own heading says none of it runs;
 *   2. every row carries a `not built` marker in the same monospace the page
 *      uses for real output, so it reads as a field of the row rather than as
 *      copywriting;
 *   3. the closing paragraph says it again and adds the part a reader would
 *      otherwise have to work out, which is that none of it is counted in any
 *      figure on this page.
 *
 * The one row that mentions something already in the repository says so and says
 * where it stops. `repos.py` finds candidate repositories and proposes them for
 * a person to confirm; it exposes no `run(ctx)` and produces no verdict, and the
 * row's copy is careful that the checking described around it is the unbuilt
 * part.
 *
 * **Why this is a ledger and not more cards.** The band above is a field of
 * surfaces and the band below is a dark panel, so a third grid of cards would
 * be the same gesture three times down one page. Rows of title against prose,
 * hairline separated, is the shape of a table of contents, which is what a
 * direction actually is. It also gives each item as much room as its argument
 * needs, and the statistics row needs four times what the bibliography row does.
 *
 * ---
 *
 * **On measuring these against themselves at every width.** `Rise` and
 * `useOwnTrack` are documented in `motion/mobile.tsx` as the narrow-viewport
 * answer, where a window expressed as a fraction of a section is a different
 * number of pixels than it was on a desktop. The reasoning does not actually
 * stop at 1100px: a row here is between 120 and 200px tall depending on how long
 * its paragraph wraps, so its offset inside the band moves whenever the copy is
 * edited, at every viewport. A constant derived from today's geometry would be
 * wrong the first time somebody adds a sentence.
 *
 * So each row owns its track. Progress 0 is the frame its top edge reaches the
 * fold and progress 0.5 is its centre at the centre of the screen, exactly, at
 * any viewport and any row height, and the stagger between rows falls out of the
 * fact that they are at different heights on the page. That is the teardown's
 * "stagger measured in scroll distance" as a geometric fact rather than as a set
 * of offsets. The cost is one scroll subscription per row.
 */

type Direction = {
  title: string;
  body: ReactNode;
};

const DIRECTIONS: Direction[] = [
  {
    title: "Statistical validity",
    body: (
      <>
        statcheck recomputes a p-value from the test statistic and the degrees of freedom the paper
        already printed, so <Mono>t(38) = 2.1, p &lt; .01</Mono> can be compared against{" "}
        <Mono>p = .042</Mono> without asking the author for anything. GRIM goes further and proves a
        reported mean impossible: a mean of whole numbers over n items has to be a multiple of 1/n.
        Both are arithmetic on figures already on the page, and in both the hard part is knowing
        when they apply rather than how to compute them, so the default answer would be
        unverifiable.
      </>
    ),
  },
  {
    title: "Submission integrity",
    body: (
      <>
        The questions a programme chair asks by hand. Is this still anonymous for a double-blind
        venue, given the author block, the acknowledgements, a repository URL with a username in it
        and a self-citation written in the first person. Is it inside the page limit the venue set.
        Is there text hidden at 0pt, in white, or off the page, put there to steer a model that
        reads the submission. All deterministic, and all properties of the compiled PDF rather than
        of the LaTeX, so they wait on a PDF ingest path.
      </>
    ),
  },
  {
    title: "Bibliography integrity",
    body: (
      <>
        A reference in the bibliography that no <Mono>\cite</Mono> in the body points at, and a
        citation with no reference behind it. Set arithmetic over two lists that are both already in
        the source, which makes it the cheapest thing on this list and the one that catches a
        bibliography that was generated rather than collected.
      </>
    ),
  },
  {
    title: "The repository, beside the arithmetic",
    body: (
      <>
        When the numbers in a table are being recomputed, the repository the paper points at is the
        other half of the same question: does it resolve, is a commit pinned rather than a moving
        branch, do the versions it declares match the ones the paper names.{" "}
        <Mono>backend/pv/checks/repos.py</Mono> is where this starts and today it stops early on
        purpose. It finds the candidates, ranks them and waits for a person to confirm one, because
        a candidate is not a verdict.
      </>
    ),
  },
  {
    title: "A rerun on compute we rent",
    body: (
      <>
        The paper&rsquo;s own code in a container, on hosted compute, comparing what it produces
        against what the paper prints. This is the one people ask for and the least settled, so the
        hard part is worth stating rather than hiding: a training run is not deterministic, the same
        code can print a different number twice, and a seed&rsquo;s worth of variance is not a
        divergence. Until that has an answer this cannot return a verdict at all.
      </>
    ),
  },
];

/** How far the text lags the rule that draws above it, in the row's own travel. */
const LAG = 0.06;

/** How much of the row's arrival the rule spends drawing. It has to get there first. */
const RULE_SHARE = 0.75;

/**
 * The hairline at the head of a row, inking in as the row arrives.
 *
 * Two lines on top of each other: the resting hairline the page already uses
 * between rows, and a slightly stronger one drawn over it left to right. The
 * drawn stroke is `--site-line-strong` rather than ink, because five black rules
 * across a page is a table, and this is meant to read as the rule being written
 * rather than as a border appearing.
 *
 * Below the breakpoint it is the resting hairline and nothing else. The rule
 * would still draw correctly there, but the text beside it comes through
 * `Arrive`, which measures its own box on a narrow screen, and a stroke on one
 * measurement beside text on another is two things arriving at nearly but not
 * quite the same moment. One of them has to go, and the one that carries the
 * content stays.
 */
function RowRule({
  progress,
  from,
  to,
  drawn,
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  drawn: boolean;
}) {
  return (
    <span aria-hidden="true" className="relative block h-px w-full">
      <span className="absolute inset-0" style={{ background: "var(--site-line)" }} />
      {drawn && (
        <svg className="absolute inset-0 h-px w-full" viewBox="0 0 1000 1" preserveAspectRatio="none">
          <g stroke="var(--site-line-strong)">
            <DrawLine progress={progress} from={from} to={to} d="M0 0.5 H1000" strokeWidth={1} />
          </g>
        </svg>
      )}
    </span>
  );
}

/** The marker every row carries. Monospace, muted, and not a verdict word. */
function NotBuilt() {
  return (
    <span
      className="site-mono inline-flex shrink-0 items-center px-2.5 py-1"
      style={{
        fontSize: "12px",
        lineHeight: 1.4,
        color: "var(--site-muted)",
        border: "1px solid var(--site-line)",
        borderRadius: "var(--site-radius-pill)",
      }}
    >
      not built
    </span>
  );
}

/**
 * One row: title and marker on the left, the argument on the right.
 *
 * The title column is capped rather than proportional. A direction is named in
 * two or three words and a column that grows with the viewport would set those
 * words as a headline, which is the emphasis the row below it should be getting.
 */
function DirectionRow({ item }: { item: Direction }) {
  const row = useRef<HTMLLIElement>(null);
  const { progress, from, to } = useOwnTrack(row, "row");
  const wide = useWideLayout(WIDE);

  return (
    <li ref={row} className="flex flex-col gap-4 pt-6 two:gap-5 two:pt-8">
      <RowRule
        progress={progress}
        from={from}
        to={from + (to - from) * RULE_SHARE}
        drawn={wide}
      />
      <Arrive
        progress={progress}
        from={from + LAG}
        to={to}
        lead={LAG}
        y={14}
        className="grid gap-3 three:grid-cols-[minmax(0,220px)_minmax(0,1fr)] three:gap-12"
      >
        <div className="flex flex-wrap items-center gap-3 three:flex-col three:items-start">
          <h4
            style={{
              fontSize: "clamp(17px, 1.3vw, 20px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.4,
              color: "var(--site-ink)",
            }}
          >
            {item.title}
          </h4>
          <NotBuilt />
        </div>
        <p className="site-body max-w-[68ch]" style={{ fontSize: "15px" }}>
          {item.body}
        </p>
      </Arrive>
    </li>
  );
}

export function ChecksDirection() {
  return (
    <div className="site-stack flex flex-col gap-8 two:gap-10">
      {/* `Reveal`, not `Rise`, and it is the one block here that should not be
          scrubbed. This is a band opener and `section-tag.tsx` builds the page's
          section openers the same way, down to the 0.06 between the label and
          the heading, so a reader meets the same gesture at the head of every
          band whether or not it is a `<section>`. It also takes the block off
          the scroll machinery: driving a browser through the scrubbed version
          caught it once at opacity 0.19 with its own centre in the middle of the
          screen and twice at 1.00, which is a scroll subscription whose measured
          offsets had not settled rather than a window in the wrong place. A
          `Reveal` fires once, on an observer, and stays. */}
      <div className="flex flex-col items-start gap-4">
        <Reveal y={20}>
          <Tag>Where this goes</Tag>
        </Reveal>
        <Reveal y={20} delay={0.06}>
          <h3
            className="max-w-[24ch]"
            style={{
              fontSize: "clamp(24px, 2.6vw, 36px)",
              fontWeight: 400,
              letterSpacing: "-0.03em",
              lineHeight: 1.3,
              color: "var(--site-ink)",
            }}
          >
            Designed next. None of it runs.
          </h3>
        </Reveal>
      </div>

      <ol className="flex flex-col">
        {DIRECTIONS.map((item) => (
          <DirectionRow key={item.title} item={item} />
        ))}
      </ol>

      <Rise y={20}>
        <p className="site-body max-w-[68ch]">
          None of the five runs on a paper today, and nothing above is counted in any figure on this
          page. A check reaches the list of what runs only once it can produce a verdict from
          arithmetic, or say why it cannot.
        </p>
      </Rise>
    </div>
  );
}
