import { Checks } from "@/components/site/checks";
import { Decides } from "@/components/site/decides";
import { Faq } from "@/components/site/faq";
import { Hero } from "@/components/site/hero";
import { Intro } from "@/components/site/intro";
import { Measured } from "@/components/site/measured";
import { Process } from "@/components/site/process";

/**
 * The landing page.
 *
 * The order is the published page's own, and it is an argument rather than a
 * list: what this is, what it does, how a run proceeds, what it checks, how it
 * decides, what that has actually measured, the questions worth asking, what is
 * not built yet, and then one way in.
 *
 * Sections land here one at a time as they are ported.
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
      <Faq />
    </>
  );
}
