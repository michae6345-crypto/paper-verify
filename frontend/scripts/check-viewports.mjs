/**
 * Which sections actually animate, at the viewports people actually have.
 *
 * This exists because the landing page shipped twice with its two pinned
 * sections silently turned off. Both gates were arithmetic done on paper — a
 * budget in a block comment, a `matchMedia` threshold derived from it — and
 * neither was ever checked against a browser. A 1920 x 1080 screen at the 125%
 * scaling Windows ships by default reports an `innerHeight` of 720. The gates
 * asked for 760 and 860. The page's signature scroll moment was off for the
 * majority case and every static check passed, because a `curl` of the HTML
 * cannot see a pin that did not happen.
 *
 * So: drive a real browser, at real sizes, and assert.
 *
 *   node scripts/check-viewports.mjs                     # against localhost:3000
 *   node scripts/check-viewports.mjs https://…           # against a deployment
 *
 * Exits non-zero if a section that should pin does not, or if the scrubbed
 * sections stop responding to scroll. `PINNED` here means the section rendered
 * its pinned tree, which is what `position: sticky` inside it proves.
 *
 * Playwright is deliberately **not** a dependency in `package.json`. It drags
 * browser binaries into every install and every deployment build, to run a check
 * that belongs on a developer's machine and in CI rather than in the bundle that
 * ships. Install it when you want to run this:
 *
 *   npm i -D playwright && npx playwright install chromium
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "This check needs Playwright, which is not a project dependency on purpose.\n" +
      "  npm i -D playwright && npx playwright install chromium\n",
  );
  process.exit(2);
}

const TARGET = process.argv[2] ?? "http://localhost:3000/";

/**
 * The viewports, and why each one is in the list.
 *
 * These are `innerHeight` values — what the page actually gets — not screen
 * heights. The difference is the browser's own chrome, which is roughly 140px
 * with one row of tabs, and it is exactly the difference that was missed.
 */
const VIEWPORTS = [
  { name: "1920x1080 @125% (the default Windows laptop)", width: 1536, height: 720 },
  { name: "1366x768 laptop", width: 1366, height: 648 },
  { name: "1440x900 laptop", width: 1440, height: 760 },
  { name: "1920x1080 @100%", width: 1920, height: 940 },
  { name: "phone, browser chrome showing", width: 390, height: 664 },
  // The three the mobile pass is aimed at. 390x844 is an iPhone 14/15 with the
  // toolbars retracted, which is the state a page is read in rather than the one
  // it is opened in; 360x740 is the small-Android floor; 834x1112 is an iPad
  // held upright, which is the width that falls between every branch on this
  // page — too narrow for either pin, too wide for a phone's spine to look like
  // anything but a phone's spine.
  { name: "iPhone 14/15, toolbars retracted", width: 390, height: 844 },
  { name: "small Android", width: 360, height: 740 },
  { name: "tablet portrait", width: 834, height: 1112 },
];

/**
 * Sections expected to render a pinned tree, and the floor each needs.
 *
 * These must be the same numbers as the `matchMedia` queries in the components,
 * and the point of the list is that they are asserted in both directions: a
 * section that fits its floor and does not pin is a failure, and so is a section
 * that pins below its floor, because that one is hiding its own lower half.
 *
 * `apparatus` was 1100 x 860, which no ordinary laptop has ever satisfied: the
 * default Windows machine in the first row of `VIEWPORTS` reports 720. Its
 * budget is now measured at 656 and its floor is 700; the derivation is in the
 * block comment in `apparatus-panels.tsx`.
 */
const PINNED = [
  { id: "hero", minWidth: 1024, minHeight: 700 },
  { id: "intro", minWidth: 0, minHeight: 0 },
  { id: "apparatus", minWidth: 1100, minHeight: 700 },
];

async function measure(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.scrollTo(0, 0);
    await sleep(700);

    const sectionOf = (el) => {
      for (let n = el; n; n = n.parentElement) if (n.id) return n.id;
      return null;
    };

    // A pinned tree is one containing a sticky box. The static fallbacks
    // contain none, which is what makes this a reliable discriminator.
    const pinned = new Set();
    for (const el of document.querySelectorAll("*")) {
      if (getComputedStyle(el).position === "sticky") {
        const id = sectionOf(el);
        if (id) pinned.add(id);
      }
    }

    // Does scrubbing still respond? Take a scrub below the fold, confirm it is
    // dark at rest, scroll it to the middle, confirm it lit.
    const scrubs = [...document.querySelectorAll("[data-scrub]")].map((el) => ({
      el,
      top: el.getBoundingClientRect().top + window.scrollY,
    }));
    const probe = scrubs.find(
      (s) => s.top > window.innerHeight * 2 && getComputedStyle(s.el).opacity === "0",
    );

    let scrubWorks = null;
    if (probe) {
      window.scrollTo(0, probe.top - window.innerHeight / 2);
      await sleep(900);
      scrubWorks = getComputedStyle(probe.el).opacity !== "0";
    }

    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pinned: [...pinned],
      scrubCount: scrubs.length,
      scrubWorks,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
}

/**
 * The check that would have caught the mobile pass before it was written twice.
 *
 * For every scrubbed element, scroll until its own centre is at the middle of
 * the screen — the position it is being read at — and read its opacity there.
 * Anything still faint is an element the reader never sees arrive, which is the
 * one failure direction that costs content rather than movement.
 * `motion/scrub.tsx` states the asymmetry and every constant in this directory
 * is placed against it.
 *
 * **The reading position, not the fold.** An element whose window opens as its
 * top edge appears is *supposed* to be at zero when its centre reaches the
 * bottom edge — it has barely started. Asserting there fails correct code. The
 * middle of the screen is where the claim actually is.
 *
 * At 390 x 844 the first run of this found **thirty of seventy-nine elements
 * misplaced and twenty-three of them still at opacity 0**: every reason code in
 * `decides`, every roadmap item, every row of the report card, three of five
 * process cards, three of four verdict pills. All of them were fine at
 * 1536 x 720, because every window in those files was a fraction of a section
 * that is two to three times taller on a phone. None of it was visible from the
 * source, and no static check could see it.
 *
 * Three exemptions, each of which is a case where the question is unfair rather
 * than a case where the answer is inconvenient:
 *
 *   inside a pin      a pinned frame holds still while its contents advance, so
 *                     "where this element is on screen" is not a quantity its
 *                     animation has any relationship to. A sticky ancestor is
 *                     the discriminator, as it is in `measure` above.
 *   `data-reveal`     a `Reveal` is a 700ms tween triggered by an observer, not
 *                     a scroll position. Reading its opacity one frame after
 *                     scrolling to it measures the tween's start, always.
 *   under 20 chars    a node on a spine is a 6px dot whose window is set by the
 *                     draw that reaches it, not by where the dot is. It is
 *                     supposed to be dark until the line arrives.
 */
async function probeArrival(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const pinned = (el) => {
      for (let n = el; n; n = n.parentElement) {
        if (getComputedStyle(n).position === "sticky") return true;
      }
      return false;
    };
    const sectionOf = (el) => {
      for (let n = el; n; n = n.parentElement) if (n.id) return n.id;
      return "?";
    };

    window.scrollTo(0, 0);
    await sleep(500);

    const items = [...document.querySelectorAll("[data-scrub]:not([data-reveal])")]
      .filter((el) => !pinned(el) && (el.textContent ?? "").trim().length >= 20)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, centre: r.top + window.scrollY + r.height / 2 };
      });

    const dark = [];
    for (const it of items) {
      window.scrollTo(0, Math.max(0, it.centre - window.innerHeight / 2));
      await sleep(70);
      const opacity = parseFloat(getComputedStyle(it.el).opacity);
      if (opacity < 0.5) {
        const text = (it.el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        dark.push(`${sectionOf(it.el)} @${opacity.toFixed(2)}: ${text}`);
      }
    }
    return { checked: items.length, dark };
  });
}

const browser = await chromium.launch();
let failures = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(TARGET, { waitUntil: "networkidle" });
  const r = await measure(page);

  console.log(`\n${vp.name}  ->  ${r.viewport}`);
  console.log(`  scrubbed elements: ${r.scrubCount}, responds to scroll: ${r.scrubWorks}`);
  console.log(`  pinned: ${r.pinned.length ? r.pinned.join(", ") : "none"}`);

  if (r.scrubWorks === false) {
    console.log("  FAIL scrubbed sections stopped responding to scroll");
    failures += 1;
  }

  for (const section of PINNED) {
    const shouldPin = vp.width >= section.minWidth && vp.height >= section.minHeight;
    const didPin = r.pinned.includes(section.id);
    if (shouldPin && !didPin) {
      console.log(`  FAIL #${section.id} fits (${section.minWidth}x${section.minHeight}) but did not pin`);
      failures += 1;
    }
    if (!shouldPin && didPin) {
      console.log(`  FAIL #${section.id} pinned below its own floor, so its lower half is unreachable`);
      failures += 1;
    }
  }

  const arrival = await probeArrival(page);
  console.log(
    `  scroll-driven text blocks: ${arrival.checked}, faint at reading position: ${arrival.dark.length}`,
  );
  for (const item of arrival.dark) {
    console.log(`  FAIL still arriving once it is in the middle of the screen — ${item}`);
    failures += 1;
  }

  await page.close();
}

await browser.close();

console.log(failures === 0 ? "\nEvery section behaved as its floor says it should." : `\n${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
