import { Apparatus } from "@/components/site/apparatus";
import { Checks } from "@/components/site/checks";
import { Decides } from "@/components/site/decides";
import { DemoCta } from "@/components/site/demo-cta";
import { Faq } from "@/components/site/faq";
import { Hero } from "@/components/site/hero";
import { Intro } from "@/components/site/intro";
import { Measured } from "@/components/site/measured";
import { Process } from "@/components/site/process";
import { Report } from "@/components/site/report";
import { Showcase } from "@/components/site/showcase";

/**
 * The landing page.
 *
 * The order is an argument rather than a list: what this is, what it does, how a
 * run proceeds, what extraction actually yields, what it checks, how it decides,
 * what that has measured, what a reviewer ends up holding, the questions worth
 * asking, and then the ask.
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
 *
 * `Showcase` sits between `Process` and `Checks`. The reader has just been told
 * the five stages a run moves through, so four real tables from four real papers
 * are what extraction actually yields, and seeing that earns the checks that
 * follow. It deliberately does not sit next to `Measured`: the showcase binds
 * `PAPERS`, `TABLES` and `CELLS` from `corpus.ts` and `Measured` states the same
 * constants as rows, so adjacent they would read as saying it twice.
 *
 * ---
 *
 * **The two changes at the foot of the page, and why nothing above them moved.**
 *
 * `Roadmap` is gone. Its honest-limits content lives inline in `Checks` now, as
 * future framing attached to the checks it qualifies, which is where a reader
 * meets the limit rather than four sections later. What it cost the page is
 * structural and worth naming: it was the last object before the footer and it
 * was a dark card, so the page used to step down into the black footer instead
 * of arriving at it from a white one.
 *
 * `DemoCta` is last and it is the first dark *field* on the page. That is what
 * replaces the step, and more of it: `Measured`, `Report` and `Faq` are three
 * consecutive light sections, the flattest stretch of the page, and inverting
 * straight out of them is the largest rhythm change available anywhere. The
 * section's own header records why it is `--site-deep` and not the footer's
 * black.
 *
 * Nothing above `Faq` moved, and that is a conclusion rather than an oversight.
 * Every remaining position is pinned by an argument already made above:
 * `Showcase` has to follow `Process` and avoid `Measured`, `Apparatus` has to
 * follow `Decides`, `Report` has to follow `Measured`. That leaves exactly one
 * free slot, which is where `Faq` sits, and it is forced too. Three of the five
 * questions are only answerable in terms `Report` establishes: what a permalink
 * carries, what "held" means, that no venue receives anything. Put the FAQ
 * before `Report` and the answers arrive before the vocabulary they need.
 *
 * So the last three sections are the funnel the page has been building toward.
 * `Report` is what you get, `Faq` is every objection to it answered including
 * the ones with uncomfortable answers, and `DemoCta` is the ask. The FAQ closing
 * on "if it is wrong about someone's work, who answers for it" and the next
 * screen asking for a demo is the sequence in the right order: the hardest
 * question first, then the request.
 *
 * The asks in the last third are meant to be different from each other. The
 * `Faq` card offers a finished report to read, which is evidence rather than a
 * request, and `DemoCta` makes the case for a demo and then asks for one. The
 * footer has since moved to a demo ask of its own and the header carries a
 * `Book a demo` control as well, so `/demo` is now the target of three surfaces
 * on one screen. That is worth a decision by somebody who owns more than one of
 * them; from here the only thing that could be done was to stop `DemoCta` from
 * repeating the button's words in its heading.
 */
export default function SitePage() {
  return (
    <>
      <Hero />
      <Intro />
      <Process />
      <Showcase />
      <Checks />
      <Decides />
      <Apparatus />
      <Measured />
      <Report />
      <Faq />
      <DemoCta />
    </>
  );
}
