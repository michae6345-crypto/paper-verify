/**
 * Scratch probe. For every scrubbed element, what opacity is it at on the frame
 * its own centre first crosses the fold? Anything near 1 finished below the
 * screen; anything near 0 is still invisible while it is being read.
 *
 *   node scripts/probe-motion.mjs <url> [width] [height]
 */
import { chromium } from "playwright";

const TARGET = process.argv[2] ?? "http://localhost:3100/";
const W = Number(process.argv[3] ?? 390);
const H = Number(process.argv[4] ?? 844);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: W, height: H },
  isMobile: W < 700,
  hasTouch: W < 900,
  reducedMotion: "no-preference",
});
await page.goto(TARGET, { waitUntil: "networkidle" });

const rows = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.scrollTo(0, 0);
  await sleep(600);

  const items = [...document.querySelectorAll("[data-scrub]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, top: r.top + window.scrollY, h: r.height };
  });

  const sectionOf = (el) => {
    for (let n = el; n; n = n.parentElement) if (n.id) return n.id;
    return "?";
  };
  const text = (el) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 34);

  const out = [];
  for (const it of items) {
    const centre = it.top + it.h / 2;

    // Two moments, and only the second is a bar anything should be held to.
    //
    //   fold   its centre at the bottom edge of the screen. It is arriving. An
    //          element that is already at 1 here did all of its animating below
    //          the screen; an element at 0 here is simply starting, which is
    //          what a window opening on its own top edge does.
    //   read   its centre at the middle of the screen. This is where the reader
    //          is looking, and an element still dark here is one the reader
    //          never sees move — the failure this page is built to avoid.
    window.scrollTo(0, Math.max(0, centre - window.innerHeight));
    await sleep(80);
    const fold = parseFloat(getComputedStyle(it.el).opacity);

    window.scrollTo(0, Math.max(0, centre - window.innerHeight / 2));
    await sleep(80);
    const read = parseFloat(getComputedStyle(it.el).opacity);

    out.push({
      section: sectionOf(it.el),
      text: text(it.el),
      atFold: Number(fold.toFixed(2)),
      atRead: Number(read.toFixed(2)),
    });
  }
  return out;
});

await browser.close();

let bad = 0;
for (const r of rows) {
  const flag = r.atRead < 0.5 ? "DARK-WHEN-READ" : r.atFold > 0.9 ? "done below" : "";
  if (r.atRead < 0.5) bad += 1;
  console.log(
    `${String(r.atFold).padStart(5)} ${String(r.atRead).padStart(5)}  ${flag.padEnd(15)}  ` +
      `${r.section.padEnd(10)}  ${r.text}`,
  );
}
console.log(`\n${rows.length} scrubbed elements, ${bad} dark when read, at ${W}x${H}`);
