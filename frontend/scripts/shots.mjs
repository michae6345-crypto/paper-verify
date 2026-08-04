/**
 * Scratch screenshot runner. Not committed — see the report.
 *
 *   node scripts/shots.mjs <url> <outdir> [width] [height]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const TARGET = process.argv[2] ?? "http://localhost:3100/";
const OUT = process.argv[3] ?? ".shots";
const W = Number(process.argv[4] ?? 390);
const H = Number(process.argv[5] ?? 844);

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  isMobile: W < 700,
  hasTouch: W < 900,
  reducedMotion: "no-preference",
});
await page.goto(TARGET, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const total = await page.evaluate(() => document.body.scrollHeight);
console.log(`document height ${total} at ${W}x${H}`);

let i = 0;
for (let y = 0; y < total && i < 24; y += Math.round(H * 0.85)) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2, "0")}-y${y}.png` });
  i += 1;
}

await browser.close();
console.log(`${i} shots in ${OUT}`);
