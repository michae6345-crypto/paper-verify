/**
 * Open the site in Brave with motion actually enabled, and prove it.
 *
 * This machine has Windows animation effects off, so every browser on it reports
 * `prefers-reduced-motion: reduce` and the page correctly renders with no motion.
 * The Chromium command-line flag `--force-prefers-reduced-motion` only forces it
 * *on*; there is no documented flag for the other direction, so launching Brave
 * with an invented one silently does nothing.
 *
 * Playwright can set it, because it goes through CDP's emulation domain rather
 * than through a flag. So this drives the user's own Brave binary, headed, with
 * the preference overridden — and then measures the page at three scroll
 * positions so the window that opens is backed by numbers rather than by a claim.
 *
 *   node scripts/preview-motion.mjs [url]
 *
 * Leave the window open. Closing this process closes the browser.
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Needs Playwright:  npm i -D playwright && npx playwright install chromium\n");
  process.exit(2);
}

const BRAVE = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const TARGET = process.argv[2] ?? "https://paper-verify-indol.vercel.app/";

const browser = await chromium.launch({
  headless: false,
  executablePath: BRAVE,
  args: ["--no-first-run", "--no-default-browser-check", "--start-maximized"],
});

const context = await browser.newContext({
  reducedMotion: "no-preference",
  viewport: null,
});

const page = await context.newPage();
await page.goto(TARGET, { waitUntil: "networkidle" });

const report = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.scrollTo(0, 0);
  await sleep(900);

  const sample = () => {
    const scrubs = [...document.querySelectorAll("[data-scrub]")];
    const path = document.querySelector("[data-scrub-path]");
    const sticky = [...document.querySelectorAll("*")].filter(
      (el) => getComputedStyle(el).position === "sticky",
    ).length;
    return {
      hidden: scrubs.filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.05).length,
      lit: scrubs.filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.95).length,
      spine: path ? getComputedStyle(path).strokeDasharray : null,
      sticky,
    };
  };

  const out = { reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, frames: {} };
  for (const y of [0, 500, 1100, 1800]) {
    window.scrollTo(0, y);
    await sleep(800);
    out.frames[`y=${y}`] = sample();
  }
  window.scrollTo(0, 0);
  return out;
});

console.log(`\nprefers-reduced-motion inside this window: ${report.reduced}`);
for (const [where, f] of Object.entries(report.frames)) {
  console.log(`  ${where.padEnd(8)} hidden ${String(f.hidden).padStart(3)}  lit ${String(f.lit).padStart(3)}  sticky ${f.sticky}  spine ${f.spine}`);
}
console.log("\nBrave is open with motion enabled. Scroll it. Ctrl+C here closes it.\n");

// Hold the process open so the window stays up.
await new Promise(() => {});
