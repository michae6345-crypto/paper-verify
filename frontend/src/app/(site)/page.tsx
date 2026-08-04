import { Apparatus } from "@/components/site/apparatus";
import { Checks } from "@/components/site/checks";
import { Decides } from "@/components/site/decides";
import { DemoCta } from "@/components/site/demo-cta";
import { Faq } from "@/components/site/faq";
import { Hero } from "@/components/site/hero";
import { Intro } from "@/components/site/intro";
import { Report } from "@/components/site/report";
import { Showcase } from "@/components/site/showcase";

/**
 * The landing page.
 *
 * The order is an argument: what this is, what it does, what extraction yields,
 * what it checks, how it decides, what a reviewer ends up holding, the questions
 * worth asking, then the ask.
 *
 * Four positions are pinned by that argument and the rest follow from them.
 *
 * **`Process` is unmounted.** It named the five `RunStage` values a run moves
 * through, one line each, and the hero spine already draws those five names and
 * lights them in order as the pipeline runs. So it restated in a screen of
 * height what the reader had just watched happen. The file stays on disk: the
 * stages are real and a future run view may well want them, but the landing page
 * cannot spend a viewport on a caption for its own hero.
 *
 * `Showcase` therefore opens the middle of the page. It still earns the checks
 * after it, for the reason it always did: four real tables from four real papers
 * are what extraction actually yields, and the argument only needed the stages
 * named, which the hero does.
 *
 * `Apparatus` follows `Decides`, and this is the load-bearing one. Most of what
 * the panel shows is **not checked**: thirty-six of the forty-five body cells in
 * BERT's GLUE table carry the interrupted rule, because no check in that report
 * makes a claim about them. A reader who has not been told that declining is a
 * first-class outcome reads a table full of those marks as a failure, and §7 is
 * explicit that it must not read that way. `Decides` is what establishes it,
 * naming four reason codes, so the panel lands as proof of the claim just made.
 * It also deliberately does not follow `Checks`, which quotes the same BERT
 * finding as six evidence rows; two sections apart it reads as a callback, and
 * adjacent it would have read as a repeat.
 *
 * `Report` is the payoff and has to be earned, so it comes after the checks and
 * the determinism rule. Described earlier it is a brochure; here it is a summary
 * of things already established.
 *
 * `Faq` follows `Report` because three of its four questions are only answerable
 * in terms `Report` establishes: what a permalink carries, what held means, that
 * no venue receives anything.
 *
 * `DemoCta` is last and is the first dark *field* on the page. `Report` and
 * `Faq` in front of it are the flattest stretch of the page, and inverting
 * straight out of them is the largest rhythm change available anywhere. The
 * section's own header records why it is `--site-deep` and not the footer's
 * black.
 *
 * ---
 *
 * **Two sections have left this list and neither was replaced.**
 *
 * `Roadmap` is gone; its honest-limits content lives inline in `Checks`, as
 * future framing attached to the checks it qualifies, which is where a reader
 * meets the limit rather than four sections later.
 *
 * `Measured` is gone as a section and its five figures render inside `Decides`,
 * under the reason codes. Two of them are that section's evidence: `0 of 4`
 * checks call a model, and 32 things were declined with a reason. A ledger of
 * corpus counts standing on its own between `Apparatus` and `Report` was volume;
 * under the claim it is the proof of it, and the page is one section break
 * shorter for it.
 *
 * The asks in the last third are meant to be different from each other. The
 * `Faq` card offers a finished report to read, which is evidence rather than a
 * request, and `DemoCta` makes the case for a demo and then asks for one. The
 * footer has a demo ask of its own and the header carries a `Book a demo`
 * control, so `/demo` is the target of three surfaces on one screen. That is
 * worth a decision by somebody who owns more than one of them.
 */
export default function SitePage() {
  return (
    <>
      <Hero />
      <Intro />
      <Showcase />
      <Checks />
      <Decides />
      <Apparatus />
      <Report />
      <Faq />
      <DemoCta />
    </>
  );
}
