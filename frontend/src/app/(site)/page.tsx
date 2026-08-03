import { Apparatus } from "@/components/site/apparatus";
import { Checks } from "@/components/site/checks";
import { Decides } from "@/components/site/decides";
import { Faq } from "@/components/site/faq";
import { Hero } from "@/components/site/hero";
import { Intro } from "@/components/site/intro";
import { Measured } from "@/components/site/measured";
import { Process } from "@/components/site/process";
import { Report } from "@/components/site/report";
import { Roadmap } from "@/components/site/roadmap";

/**
 * The landing page.
 *
 * The order is the published page's own, and it is an argument rather than a
 * list: what this is, what it does, how a run proceeds, what it checks, how it
 * decides, what that has actually measured, what a reviewer ends up holding, the
 * questions worth asking, and what is not built yet.
 *
 * `Report` sits after `Measured` because it is the payoff and it has to be
 * earned. A section describing the artifact before the reader knows what goes
 * into it is a brochure; after the checks, the determinism rule and the corpus
 * figures, it is a summary of things already established.
 *
 * `Apparatus` is the page's signature scroll moment (`docs/MOTION_TEARDOWN.md`
 * §3) and it sits between `Decides` and `Measured` for one reason: most of what
 * it shows is **not checked**. Thirty-six of the forty-five body cells in BERT's
 * GLUE table carry the interrupted rule, because no check in that report makes a
 * claim about them. A reader who has not yet been told that declining is a
 * first-class outcome reads a table full of those marks as a failure, and §7 is
 * explicit that it must not read that way. `Decides` is the section that
 * establishes it, naming four reason codes and the determinism rule. So the
 * panel lands immediately after, as the proof of the claim just made rather than
 * as a puzzle, and `Measured` then counts the same refusal across the whole
 * corpus.
 *
 * It also deliberately does not follow `Checks`, which already quotes the same
 * BERT finding as six evidence rows. Two sections apart, the panel reads as a
 * callback: the finding you were shown as a list, now in its place on the table
 * it came from. Adjacent, it would have read as a repeat.
 */
export default function SitePage() {
  return (
    <>
      <Hero />
      <Intro />
      <Process />
      <Checks />
      <Decides />
      <Apparatus />
      <Measured />
      <Report />
      <Faq />
      <Roadmap />
    </>
  );
}
