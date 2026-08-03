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
  { name: "phone", width: 390, height: 664 },
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

  await page.close();
}

await browser.close();

console.log(failures === 0 ? "\nEvery section behaved as its floor says it should." : `\n${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
