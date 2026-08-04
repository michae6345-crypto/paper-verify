/**
 * Screenshot the report and run views at the three sizes that matter, under both
 * motion preferences.
 *
 * Scratch harness, in the style of `check-viewports.mjs` and
 * `check-reduced-motion.mjs`: it drives a real browser rather than reasoning
 * about the CSS, because a report view is a layout and a layout has to be looked
 * at. Both motion preferences are captured for the reason
 * `check-reduced-motion.mjs` gives — this machine has Windows animation effects
 * off, so every browser on it reports `reduce`, while Chromium's own default is
 * `no-preference`. A headless pass in the default alone does not show the owner
 * of this machine what they see.
 *
 *   node scripts/shot-report.mjs <label> [origin]
 *
 * Writes to `.shots/<label>/`, which is git-ignored.
 */

import { mkdir } from "node:fs/promises";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "This check needs Playwright, which is not a project dependency on purpose.\n" +
      "  npm i --no-save playwright && npx playwright install chromium\n",
  );
  process.exit(2);
}

const LABEL = process.argv[2] ?? "shot";
const ORIGIN = process.argv[3] ?? "http://localhost:3200";

/** Real `innerHeight` values, as `check-viewports.mjs` establishes. */
const VIEWPORTS = [
  { name: "desktop", width: 1536, height: 720 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "phone", width: 390, height: 844 },
];

const ROUTES = [
  { name: "report-bert", path: "/reports/1810.04805" },
  { name: "report-transformer", path: "/reports/1706.03762" },
  { name: "report-resnet", path: "/reports/1512.03385" },
  // The heaviest fixture: 15 tables and a 1.4MB report before the projection in
  // `components/document/strip-latex.ts` takes the LaTeX out of it.
  { name: "report-clip", path: "/reports/2103.00020" },
  { name: "run-transformer", path: "/runs/1706.03762" },
];

const dir = `.shots/${LABEL}`;
await mkdir(dir, { recursive: true });

const browser = await chromium.launch();

for (const motion of ["reduce", "no-preference"]) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
    });
    for (const route of ROUTES) {
      await page.goto(ORIGIN + route.path, { waitUntil: "networkidle" });
      // The run view replays its stream; let it settle before the shutter.
      await page.waitForTimeout(route.name.startsWith("run") ? 3500 : 900);
      const file = `${dir}/${route.name}-${vp.name}-${motion}.png`;
      await page.screenshot({ path: file });
      console.log(file);
    }
    await page.close();
  }
}

await browser.close();
