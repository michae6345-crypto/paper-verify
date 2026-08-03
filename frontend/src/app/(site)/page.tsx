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
 */
export default function SitePage() {
  return (
    <>
      <Hero />
      <Intro />
      <Process />
      <Checks />
      <Decides />
      <Measured />
      <Report />
      <Faq />
      <Roadmap />
    </>
  );
}
