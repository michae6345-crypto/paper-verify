import { Apparatus } from "@/components/site/apparatus";
import { Changelog } from "@/components/site/changelog";
import { Faq } from "@/components/site/faq";
import { Hero } from "@/components/site/hero";
import { Honesty } from "@/components/site/honesty";
import { Mechanism } from "@/components/site/mechanism";
import { Provenance } from "@/components/site/provenance";
import { Section, Wash } from "@/components/site/section";
import { Sources } from "@/components/site/sources";

/**
 * The page, as alternating full-bleed fields.
 *
 * `--field-paper` and `--field-deep` alternate all the way down, and the margin
 * apparatus and the hairline grid cross every one of them unchanged, so the page
 * reads as one document that changes colour rather than as a stack of blocks.
 *
 * Every section opens with a label above its heading, and exactly one phrase per
 * section carries the `--wash`. Two on a screen would be worth nothing.
 *
 * Two things ARCHITECTURE §16 names are deliberately absent: the testimonial
 * wall and any "backed by" badge. There are no users yet and no backers, and
 * inventing either on a page whose central claim is that we do not publish
 * things we cannot support would be an odd way to make the argument.
 */
export default function SitePage() {
  return (
    <>
      <Hero />

      <Section
        id="sources"
        tone="deep"
        label="Sources"
        heading={
          <>
            What it reads, and <Wash>nothing else</Wash>.
          </>
        }
        lede="Five services, four of them wired. Nothing is sent to an author, and no paper leaves the run it belongs to."
      >
        <Sources />
      </Section>

      <Section
        id="checks"
        tone="paper"
        label="What it checks"
        heading={
          <>
            Four checks, each one <Wash>arithmetic you can redo</Wash> by hand.
          </>
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
          <>
            One pipeline, and <Wash>no stage that fails quietly</Wash>.
          </>
        }
        lede="Pick a stage to see what it produces. A check that raises is recorded as unverifiable with the reason and the run carries on; a checker module that goes missing produces a row saying so. There is no generic error state and no silent drop."
      >
        <Mechanism />
      </Section>

      <Section
        id="limits"
        tone="paper"
        label="Limits"
        heading={
          <>
            What this cannot check, and <Wash>how often it declines</Wash>.
          </>
        }
        lede="Honest incompleteness is the product. A run where half the checks come back unverifiable with clear reasons is a success, and the list of what was not checked is part of the report, not an error state."
      >
        <Honesty />
      </Section>

      <Section
        id="measured"
        tone="deep"
        label="Measured"
        heading={
          <>
            Where every number on this page <Wash>comes from</Wash>.
          </>
        }
        lede="All of it is reproducible from the repository. The corpus is ten papers' LaTeX, committed, with hand-derived answers the checkers have to match."
      >
        <Provenance />
      </Section>

      <Section
        id="faq"
        tone="paper"
        label="Questions"
        heading={
          <>
            The <Wash>hard ones</Wash> first.
          </>
        }
      >
        <Faq />
      </Section>

      <Section
        id="changelog"
        tone="deep"
        label="Changelog"
        heading={
          <>
            Recent work, <Wash>with the hash</Wash>.
          </>
        }
      >
        <Changelog />
      </Section>
    </>
  );
}
