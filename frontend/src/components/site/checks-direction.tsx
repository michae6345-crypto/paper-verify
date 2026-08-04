"use client";

import type { MotionValue } from "motion/react";
import { useRef, type ReactNode } from "react";

import { DrawLine } from "@/components/site/motion/scrub";
import { Arrive, WIDE, useOwnTrack, useWideLayout } from "@/components/site/motion/mobile";
import { Reveal } from "@/components/site/reveal";
import { Mono, Tag } from "@/components/site/ui";

/**
 * Where the checks go next.
 *
 * **This band carried `not built` markers on every row and a heading reading
 * "Designed next. None of it runs." Both are gone, at the owner's instruction.**
 * The reasoning is theirs and it is a reasonable one: this is a pre-launch demo
 * surface, nothing is being sold from it, and a page describing the product it
 * intends to be is not a page making a false claim to a customer.
 *
 * What was kept, because it is a different kind of statement: anything that
 * makes a **published figure** accurate. The corpus numbers on this page are
 * measurements of specific tables in specific papers, and the note that they
 * come from the two network-free checks is what makes `103 tables` true rather
 * than approximately true. That is arithmetic, not positioning, and it stays.
 *
 * The line worth holding if this is ever revisited: describing a roadmap in the
 * present tense is a marketing decision, and attaching a number to a named
 * researcher's paper is not.
 *
 * A ledger, because the band above is a field of cards and a third grid on one
 * page is the same gesture three times.
 *
 * **Every row owns its scroll track.** A row is between 120 and 200px tall
 * depending on how its paragraph wraps, so its offset inside the band moves
 * whenever the copy is edited, at every viewport, and a constant derived from
 * today's geometry would be wrong the first time somebody adds a sentence.
 * `useOwnTrack` measures `H + S` for the row itself: progress 0 is the frame its
 * top edge reaches the fold and 0.5 is its centre at the centre of the screen.
 * The stagger between rows then falls out of their being at different heights.
 * The cost is one scroll subscription per row.
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
        Recompute a p-value from the statistic already printed. <Mono>t(38) = 2.1, p &lt; .01</Mono>{" "}
        against <Mono>p = .042</Mono>.
      </>
    ),
  },
  {
    title: "Submission integrity",
    body: <>Anonymity, page limits, text hidden at 0pt to steer a model. All in the PDF.</>,
  },
  {
    title: "Bibliography integrity",
    body: (
      <>
        A reference nothing cites, a citation with no reference. Set arithmetic over two lists
        already in the source.
      </>
    ),
  },
  {
    title: "The repository, beside the arithmetic",
    body: (
      <>
        Does it resolve, is the commit pinned. <Mono>repos.py</Mono> ranks candidates and waits for
        a person.
      </>
    ),
  },
  {
    title: "A rerun on compute we rent",
    body: (
      <>
        The paper&rsquo;s code in a container, against the numbers it prints. A training run is not
        repeatable, so variance has no threshold yet.
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
 * across a page is a table, and this should read as the rule being written.
 *
 * Below the breakpoint it is the resting hairline and nothing else. The stroke
 * would still draw correctly there, but the text beside it comes through
 * `Arrive`, which measures its own box on a narrow screen, and two elements on
 * two different measurements arrive at nearly but not quite the same moment.
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

/**
 * One row: title and marker on the left, the argument on the right.
 *
 * The title column is capped rather than proportional. A direction is named in
 * two or three words, and a column that grows with the viewport would set those
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
      {/* The one block here that should not be scrubbed. This is a band opener,
          and `section-tag.tsx` builds the page's section openers on `Reveal`
          the same way, down to the 0.06 between the label and the heading, so a
          reader meets the same gesture at the head of every band whether or not
          it is a `<section>`. It also keeps the block off the scroll machinery:
          driving a browser through the scrubbed version caught it once at
          opacity 0.19 with its own centre in the middle of the screen and twice
          at 1.00, which is a scroll subscription whose measured offsets had not
          settled. A `Reveal` fires once, on an observer, and stays. */}
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
            What a venue gets next.
          </h3>
        </Reveal>
      </div>

      <ol className="flex flex-col">
        {DIRECTIONS.map((item) => (
          <DirectionRow key={item.title} item={item} />
        ))}
      </ol>
    </div>
  );
}
