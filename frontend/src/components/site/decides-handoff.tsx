"use client";

import type { ReactNode } from "react";

import { Rise } from "@/components/site/motion/mobile";
import { Mono } from "@/components/site/ui";

/**
 * Where the tool stops and a person starts.
 *
 * The band above says a check declines when it cannot be made deterministic.
 * This one says what that is for. A product that refuses to guess leaves work
 * on the table by construction, and the work it leaves is a reviewer's, so the
 * refusal only reads as honesty if the page also says who picks it up. Without
 * this band the section argues for its own limits and stops there.
 *
 * The three checkpoints are real and each names the code it comes from.
 * `repos.py` proposes candidate repositories and deliberately exposes no
 * `run(ctx)`, so a person confirms which one is right. A finding carries the two
 * numbers it compared and where in the source it read them. An `Amendment` in
 * `backend/pv/models.py` is keyed on a finding's fingerprint and is append-only,
 * which is why contesting one line does not rewrite the run it belongs to.
 *
 * The venue intake is the one forward-looking claim here and it is marked twice:
 * it is introduced as where this goes, and the next sentence says it is not
 * built. The sentence after that is the one that matters most and is the easiest
 * to leave out, which is that the intake would not review anything either.
 *
 * **Layout.** An asymmetric two-column split with the argument on the narrow
 * side and the mechanism on the wide one: the claim and where it goes at
 * display size on the left, the three checkpoints as a run-in list on the right.
 * Not three more cards and not three more columns. By this point in the page the
 * reader has been through a field of cards, a ledger of rows, three columns of
 * text and a dark panel, and the right answer for the closing argument is the
 * plainest setting available. Stacked, the same split reads as claim, then
 * direction, then mechanism.
 *
 * Motion: every block here measures its own travel. They sit at four different
 * heights and in two different arrangements depending on the breakpoint, so the
 * stagger comes from the geometry and there is no constant to go stale when the
 * copy changes length.
 */

/** One checkpoint: the mono verb runs into the sentence rather than heading it. */
function Checkpoint({ verb, children }: { verb: string; children: ReactNode }) {
  return (
    <li>
      <Rise y={12}>
        <p className="site-body max-w-[62ch]" style={{ fontSize: "15px" }}>
          <Mono style={{ color: "var(--site-ink)" }}>{verb}</Mono>{" "}
          {children}
        </p>
      </Rise>
    </li>
  );
}

export function DecidesHandoff() {
  return (
    <div className="site-stack grid gap-10 three:grid-cols-[2fr_3fr] three:gap-[60px]">
      {/* The positioning, both halves of it, in the narrow column. The wide
          column beside it is the mechanism. Splitting them this way is also what
          keeps the two columns near the same height: the closing paragraph used
          to sit at the foot of the mechanism column, which left 340px of empty
          left column under a four-line sentence. */}
      <div className="flex flex-col gap-6">
        <Rise y={20} kind="row">
          <p
            style={{
              fontSize: "clamp(22px, 2.2vw, 30px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.35,
              color: "var(--site-ink)",
            }}
          >
            residual stops where determinism stops. Everything past that line is a reviewer&rsquo;s,
            and that is the design rather than a gap in it.
          </p>
        </Rise>

        <Rise y={16}>
          <p className="site-body max-w-[62ch]">
            Where this goes is one intake a venue points its submissions at, so the arithmetic, the
            links and the format are settled before a reviewer opens the paper. That intake is not
            built. When it is, it will not review anything either. It takes the part of the job that
            is arithmetic off the desk of the person doing the part that is not.
          </p>
        </Rise>
      </div>

      <div className="flex flex-col gap-6">
        <Rise y={16}>
          <p className="site-body max-w-[68ch]">
            A run is a sequence of checkpoints rather than one answer at the end, and a person can
            take it at any of them. Three of those checkpoints exist today.
          </p>
        </Rise>

        <ol className="flex flex-col gap-4">
          <Checkpoint verb="propose">
            <Mono>backend/pv/checks/repos.py</Mono> finds the repositories a paper points at, ranks
            them, and stops. Somebody confirms which one is right, because a candidate is not a
            verdict.
          </Checkpoint>
          <Checkpoint verb="report">
            Every finding carries the two numbers it compared and the place in the source it read
            them from, and every decline carries its reason code, so a reader can disagree with one
            line rather than with the tool.
          </Checkpoint>
          <Checkpoint verb="contest">
            An author contests a single finding. The amendment is appended against that
            finding&rsquo;s fingerprint and nothing is edited or removed, so the run stays exactly
            as it was published and the disagreement is on the record beside it.
          </Checkpoint>
        </ol>
      </div>
    </div>
  );
}
