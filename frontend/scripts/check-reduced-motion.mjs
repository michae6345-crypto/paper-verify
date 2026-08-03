/**
 * What the page looks like to a reader whose system asks for less motion.
 *
 * This machine has Windows "animation effects" switched off
 * (`HKCU:\Control Panel\Desktop\WindowMetrics\MinAnimate = 0`), so every browser
 * on it reports `prefers-reduced-motion: reduce` and the landing page correctly
 * renders with no motion at all. That is the specified behaviour, but it means
 * the page cannot be reviewed on this machine without either changing the OS
 * setting or emulating the other value, and it means every headless check run so
 * far — which used Chromium's default of `no-preference` — was measuring a state
 * the owner of this machine never sees.
 *
 * So this asserts both halves:
 *
 *   reduce         everything resolved, nothing at zero opacity, nothing pinned.
 *                  The failure mode here is a blank page, which is what the
 *                  hydration bug in `useReducedMotion` used to produce.
 *   no-preference  the animated page, checked by `check-viewports.mjs`.
 *
 *   node scripts/check-reduced-motion.mjs [url]
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Needs Playwright:  npm i -D playwright && npx playwright install chromium\n");
  process.exit(2);
}

const TARGET = process.argv[2] ?? "http://localhost:3000/";
const browser = await chromium.launch();
let failures = 0;

for (const motion of ["reduce", "no-preference"]) {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 720 },
    reducedMotion: motion,
  });
  await page.goto(TARGET, { waitUntil: "networkidle" });

  const r = await page.evaluate(async () => {
    await new Promise((res) => setTimeout(res, 1200));
    const scrubs = [...document.querySelectorAll("[data-scrub]")];
    const hidden = scrubs.filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.05);
    const sticky = [...document.querySelectorAll("*")].filter(
      (el) => getComputedStyle(el).position === "sticky",
    );
    // Is there readable text on screen at all? A page that resolved correctly has
    // plenty; the old hydration bug left a complete document at opacity 0.
    const visibleText = [...document.querySelectorAll("h1, h2, p")].filter((el) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.opacity) > 0.5 && el.textContent.trim().length > 20;
    }).length;
    return {
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      scrubs: scrubs.length,
      atZero: hidden.length,
      sticky: sticky.length,
      visibleText,
    };
  });

  console.log(`\nprefers-reduced-motion: ${motion}`);
  console.log(`  matchMedia agrees: ${r.reduced === (motion === "reduce")}`);
  console.log(`  scrubbed elements: ${r.scrubs}, at zero opacity: ${r.atZero}`);
  console.log(`  sticky boxes: ${r.sticky}, readable blocks on screen: ${r.visibleText}`);

  if (motion === "reduce") {
    if (r.atZero > 0) {
      console.log(`  FAIL ${r.atZero} elements still at zero opacity under reduced motion`);
      failures += 1;
    }
    if (r.sticky > 0) {
      console.log(`  FAIL ${r.sticky} sticky boxes: a pin is still mounted under reduced motion`);
      failures += 1;
    }
    if (r.visibleText < 3) {
      console.log("  FAIL almost nothing readable is on screen");
      failures += 1;
    }
  } else if (r.sticky === 0) {
    console.log("  FAIL nothing pinned with motion allowed");
    failures += 1;
  }

  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nBoth motion preferences render correctly." : `\n${failures} failures.`);
process.exit(failures === 0 ? 0 : 1);
