import { Apparatus } from "@/components/site/apparatus";
import { Changelog } from "@/components/site/changelog";
import { Decision } from "@/components/site/decision";
import { Faq } from "@/components/site/faq";
import { Hero } from "@/components/site/hero";
import { heroCard, heroStages } from "@/components/site/hero-data";
import { Mechanism } from "@/components/site/mechanism";
import { Provenance } from "@/components/site/provenance";
import { Reading } from "@/components/site/reading";
import { reading } from "@/components/site/reading-data";
import { Section, TwoTone, Wash } from "@/components/site/section";
import { Sources } from "@/components/site/sources";
import { PAPERS, TABLES } from "@/components/site/corpus";

/**
 * The page: two scrubbed scenes, then a document.
 *
 * The hero and the reading are pinned and driven by scroll — the pipeline
 * running once, and then one table read twice. Everything after them is the
 * alternating field structure `DESIGN_PLAN.md` set out, with the margin
 * apparatus and the hairline grid crossing every field unchanged, so the page
 * reads as one document that changes colour rather than as a stack of blocks.
 *
 * Sections run tall and hold one idea each. Every heading is two-tone — setup in
 * the dim ink, punchline at full contrast, same size and weight — and exactly
 * one phrase on the whole page carries the `--wash`. Two would be worth nothing.
 *
 * What it can and cannot check is one section now rather than two, and it opens
 * on what it reads and how it decides. The limits are still all there, at the
 * foot of it, under a heading that says what they are.
 *
 * Two things ARCHITECTURE §16 names are deliberately absent: the testimonial
 * wall and any "backed by" badge. There are no users yet and no backers, and
 * inventing either on a page whose central claim is that we do not publish
 * things we cannot support would be an odd way to make the argument.
 */
export default function SitePage() {
  const readingRow = reading();

  return (
    <>
      <Hero stages={heroStages()} card={heroCard()} papers={PAPERS} tables={TABLES} />

      {readingRow && <Reading data={readingRow} />}

      <Section
        id="checks"
        tone="paper"
        label="What it checks"
        heading={
          <TwoTone
            setup={["Four checks exist today."]}
            punch="Each is arithmetic you could redo by hand."
          />
        }
        lede="Each entry below records a claimed reading against a computed one, and cites where both came from. Every value is real output on a real paper."
      >
        <Apparatus />
      </Section>

      <Section
        id="mechanism"
        tone="deep"
        label="How it works"
        heading={
          <TwoTone setup={["Eight stages, one report."]} punch="No stage that fails quietly." />
        }
        lede="Pick a stage to see what it produces. A check that raises is recorded as unverifiable with the reason and the run carries on; a checker module that goes missing produces a row saying so. There is no generic error state and no silent drop."
      >
        <Mechanism />
      </Section>

      <Section
        id="sources"
        tone="paper"
        label="What it reads"
        heading={
          <TwoTone setup={["Five services, four of them wired."]} punch="Nothing goes to an author." />
        }
        lede="No paper leaves the run it belongs to, and nothing is sent to anyone on the strength of a finding."
      >
        <Sources />
      </Section>

      <Section
        id="decides"
        tone="deep"
        label="How it decides"
        heading={
          <TwoTone
            setup={["Every verdict is computed,", "never estimated."]}
            punch="When it cannot be computed, we say so."
          />
        }
        lede={
          <>
            A language model never produces a verdict here. Models extract structure; deterministic
            Python computes the answer from it, and a check that cannot be made deterministic comes
            back <Wash>unverifiable, with a reason</Wash> — with the comparison attached anyway, so
            you still see both numbers.
          </>
        }
      >
        <Decision />
      </Section>

      <Section
        id="measured"
        tone="paper"
        label="Measured"
        heading={
          <TwoTone
            setup={["Every number on this page"]}
            punch="comes from a file in the repository."
          />
        }
        lede="All of it is reproducible. The corpus is ten papers' LaTeX, committed, with hand-derived answers the checkers have to match."
      >
        <Provenance />
      </Section>

      <Section
        id="faq"
        tone="deep"
        label="Questions"
        heading={<TwoTone setup={["The hard ones"]} punch="first." />}
      >
        <Faq />
      </Section>

      <Section
        id="changelog"
        tone="paper"
        label="Changelog"
        heading={<TwoTone setup={["Recent work,"]} punch="with the hash." />}
      >
        <Changelog />
      </Section>
    </>
  );
}
