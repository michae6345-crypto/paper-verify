import { Changelog } from "@/components/site/changelog";
import { Faq } from "@/components/site/faq";
import { FeatureBento } from "@/components/site/feature-bento";
import { Hero } from "@/components/site/hero";
import { Honesty } from "@/components/site/honesty";
import { Mechanism } from "@/components/site/mechanism";
import { Section } from "@/components/site/section";
import { Stats } from "@/components/site/stats";
import { TrustStrip } from "@/components/site/trust-strip";

/**
 * The nine sections of ARCHITECTURE §16, in order.
 *
 * Two things §16 names are deliberately absent: the testimonial wall and any
 * "backed by" badge. There are no users yet and no backers, and inventing either
 * on a page whose central claim is that we do not publish things we cannot
 * support would be an odd way to make the argument.
 */
export default function SitePage() {
  return (
    <>
      <Hero />

      <TrustStrip />

      <Section
        id="checks"
        label="What it checks"
        heading="Four checks, each one arithmetic you can redo by hand."
        lede="Every cell below is real output on a real paper. None of it is an illustration of what output might look like."
      >
        <FeatureBento />
      </Section>

      <Section
        id="mechanism"
        label="How it works"
        heading="One pipeline, and no stage that fails quietly."
        lede="Pick a stage to see what it produces. A check that raises is recorded as unverifiable with the reason and the run carries on; a checker module that goes missing produces a row saying so. There is no generic error state and no silent drop."
      >
        <Mechanism />
      </Section>

      <Section
        id="honesty"
        label="Limits"
        heading="What this cannot check, and how often it declines."
        lede="Honest incompleteness is the product. A run where half the checks come back unverifiable with clear reasons is a success, and the list of what was not checked is part of the report, not an error state."
      >
        <Honesty />
      </Section>

      <Section
        id="changelog"
        label="Changelog"
        heading="Recent work."
      >
        <Changelog />
      </Section>

      <Section
        id="stats"
        label="Measured"
        heading="Where the numbers on this page come from."
        lede="Everything below is reproducible from the repository. The corpus is ten papers' LaTeX, committed, with hand-derived answers the checkers have to match."
      >
        <Stats />
      </Section>

      <Section
        id="faq"
        label="Questions"
        heading="The hard ones first."
      >
        <Faq />
      </Section>
    </>
  );
}
