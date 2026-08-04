/**
 * Does the private door actually hide anything, and does it open cleanly?
 *
 * `components/gate/` puts `/check`, `/submit`, `/account` and `/dashboard`
 * behind a typed sequence. Two claims in that work cannot be verified by reading
 * it, and both are the kind that look fine in a comment and fail in a browser:
 *
 *   1. A locked visitor never sees the gated page, not even for one frame, and
 *      an unlocked one never sees the quiet 404 first. "No flash" is a claim
 *      about *painted frames*, so this samples every frame — a `requestAnimation
 *      Frame` loop installed before any document content exists — and asserts on
 *      the whole recording rather than on the state it happens to find at the
 *      end.
 *   2. The pre-hydration half-frame. A layout effect cannot run before React
 *      loads, so on a slow connection the server's 404 can paint at an unlocked
 *      reader before the swap. The inline script in `gate.tsx` is supposed to
 *      cover that, and the only way to see it is to make the connection slow:
 *      the last scenario throttles to 200kb/s, where the gap is tens of frames
 *      wide instead of zero.
 *
 * It also checks the boring half that is easy to get wrong: that typing into a
 * form does not trip the sequence, that the prompt is a real modal with focus in
 * it and `Escape` out of it, and that the unlock survives a reload.
 *
 *   node scripts/check-gate.mjs [origin] [--shots <dir>]
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Needs Playwright:  npm i --no-save playwright && npx playwright install chromium\n");
  process.exit(2);
}

const ORIGIN = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const shotsAt = process.argv.indexOf("--shots");
const SHOTS = shotsAt === -1 ? null : process.argv[shotsAt + 1];

const GATE_KEY = "residual.gate.v1";
/**
 * `/dashboard` is another workstream's route and wraps the same guard in its own
 * layout. It is checked here rather than taken on trust, because "the four
 * routes are behind the curtain" is the deliverable and three of four is not it.
 */
const GATED = ["/check", "/submit", "/account", "/dashboard"];

/**
 * Installed before anything on the page exists, so the first frame is recorded
 * too. Each entry is [ms, is the 404 visible, the visible page heading].
 * "Visible" is `getClientRects().length`, which is false for `display: none` —
 * the state the inline script leaves the 404 in for an unlocked reader.
 */
const SAMPLER = () => {
  const frames = [];
  window.__frames = frames;
  const tick = () => {
    const four = document.querySelector(".next-error-h1");
    let heading = null;
    for (const h of document.querySelectorAll("h1")) {
      if (h.classList.contains("next-error-h1")) continue;
      if (h.getClientRects().length) {
        heading = h.textContent.trim().slice(0, 48);
        break;
      }
    }
    frames.push([Math.round(performance.now()), four ? four.getClientRects().length > 0 : false, heading]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const browser = await chromium.launch();
let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail === undefined ? "" : `  (${detail})`}`);
}

async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  await context.addInitScript(SAMPLER);
  return context;
}

const framesOf = (page) => page.evaluate(() => window.__frames ?? []);
const stored = (page) => page.evaluate((k) => window.localStorage.getItem(k), GATE_KEY);
const settle = (page) => page.waitForTimeout(700);

/* -------------------------------------------------------------------------- */
console.log("\nlocked: the gated routes are not there");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();

  for (const route of GATED) {
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle" });
    await settle(page);
    const frames = await framesOf(page);
    const leaked = frames.filter((f) => f[2] !== null);
    const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

    check(body.includes("This page could not be found"), `${route} renders the 404 surface`);
    check(leaked.length === 0, `${route} never paints the page`, `${frames.length} frames sampled`);
    if (leaked.length) console.log(`       first leak: ${JSON.stringify(leaked[0])}`);
  }

  // The point of a secret door is that it does not look like a door. Compare
  // against a URL that genuinely does not exist.
  await page.goto(`${ORIGIN}/no-such-page-here`, { waitUntil: "networkidle" });
  const real = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  await page.goto(`${ORIGIN}/check`, { waitUntil: "networkidle" });
  const locked = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  check(locked === real, "locked /check reads exactly like a missing route", JSON.stringify(locked));

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/locked-check.png` });
  await context.close();
}

/* -------------------------------------------------------------------------- */
console.log("\nthe sequence");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await settle(page);
  for (const key of ["1", "2", "3"]) await page.keyboard.press(key);
  await page.waitForTimeout(120);
  check((await stored(page)) !== null, "1 2 3 on the landing page unlocks");

  await page.goto(`${ORIGIN}/check`, { waitUntil: "networkidle" });
  await settle(page);
  let frames = await framesOf(page);
  check(
    frames.some((f) => f[2] !== null),
    "/check now renders the page",
    frames.at(-1)?.[2] ?? "nothing",
  );
  check(
    frames.every((f) => f[1] === false),
    "the 404 is never painted on the way in",
    `${frames.length} frames sampled`,
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/unlocked-check.png` });

  await page.reload({ waitUntil: "networkidle" });
  await settle(page);
  frames = await framesOf(page);
  check(
    frames.some((f) => f[2] !== null) && frames.every((f) => f[1] === false),
    "the unlock survives a reload, still with no 404 frame",
  );

  // Idle reset: a stray 1 an hour ago must not be half of tonight's sequence.
  await context.clearCookies();
  await page.evaluate((k) => window.localStorage.removeItem(k), GATE_KEY);
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("1");
  await page.waitForTimeout(1600);
  await page.keyboard.press("2");
  await page.keyboard.press("3");
  await page.waitForTimeout(120);
  check((await stored(page)) === null, "a stale first key has expired, so 1 … 2 3 does nothing");

  // And a wrong key in the middle resets, while `1` itself restarts it.
  await page.keyboard.press("1");
  await page.keyboard.press("9");
  await page.keyboard.press("2");
  await page.keyboard.press("3");
  await page.waitForTimeout(120);
  check((await stored(page)) === null, "1 9 2 3 does nothing");
  for (const key of ["1", "1", "2", "3"]) await page.keyboard.press(key);
  await page.waitForTimeout(120);
  check((await stored(page)) !== null, "1 1 2 3 does open it");

  await context.close();
}

/* -------------------------------------------------------------------------- */
console.log("\ntyping is still typing");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();
  // /login is not gated and has a real text field on it. `load` rather than
  // `networkidle`: something on that page keeps a request open and idle never
  // arrives, which is not this workstream's to chase.
  await page.goto(`${ORIGIN}/login`, { waitUntil: "load" });
  await settle(page);
  const field = page.locator("input").first();
  await field.click();
  await field.type("123", { delay: 40 });
  await page.waitForTimeout(150);
  check((await stored(page)) === null, "1 2 3 typed into a text field does not unlock");
  check((await field.inputValue()) === "123", "and the field kept the characters");
  check(
    (await page.evaluate(() => document.querySelector("dialog") !== null)) === false,
    "Enter is not stolen from a form either",
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check(
    (await page.evaluate(() => document.querySelector("dialog[data-prompt]") !== null)) === false,
    "Enter inside the form did not open the prompt",
  );
  await context.close();
}

/* -------------------------------------------------------------------------- */
console.log("\nthe prompt");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await settle(page);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  let state = await page.evaluate(() => {
    const dialog = document.querySelector("dialog[data-prompt]");
    return {
      open: !!dialog?.open,
      modal: !!dialog?.matches(":modal"),
      focusInside: !!dialog?.contains(document.activeElement),
      focusTag: document.activeElement?.tagName ?? null,
      named: dialog?.getAttribute("aria-label") ?? null,
    };
  });
  check(state.open, "Enter with nothing focused opens the prompt");
  check(state.modal, "it is a real modal dialog, in the top layer");
  check(state.focusInside && state.focusTag === "INPUT", "focus lands in the field", state.focusTag);
  check(state.named !== null, "the dialog has an accessible name", state.named);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/prompt.png` });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check(
    await page.evaluate(() => document.querySelector("dialog[data-prompt]") === null),
    "Escape dismisses it",
  );
  check((await stored(page)) === null, "and dismissing it unlocks nothing");

  // Both entry checks assert the prompt is actually open before typing into it.
  // Without that they pass either way: keystrokes with no dialog to land in go
  // to the page, where `1 2 3` is the other half of this feature and would have
  // unlocked it anyway.
  const promptOpen = () =>
    page.evaluate(() => !!document.querySelector("dialog[data-prompt]")?.open);

  // A wrong entry closes without saying anything.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check(await promptOpen(), "it reopens after being dismissed");
  await page.keyboard.type("999", { delay: 30 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check((await stored(page)) === null, "a wrong entry does not unlock");
  check(
    await page.evaluate(() => document.querySelector("dialog[data-prompt]") === null),
    "and it closes silently rather than saying no",
  );

  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check(await promptOpen(), "the prompt is open before the correct entry is typed");
  check(
    await page.evaluate(() => document.activeElement?.tagName === "INPUT"),
    "and the keystrokes will land in its field",
  );
  await page.keyboard.type("123", { delay: 30 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check((await stored(page)) !== null, "typing 123 into the prompt unlocks");

  await context.close();
}

/* -------------------------------------------------------------------------- */
console.log("\nstanding at the locked door, and locking it again");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/check`, { waitUntil: "networkidle" });
  await settle(page);
  for (const key of ["1", "2", "3"]) await page.keyboard.press(key);
  await page.waitForTimeout(400);
  check(
    await page.evaluate(() => {
      const h1 = [...document.querySelectorAll("h1")].find(
        (h) => !h.classList.contains("next-error-h1") && h.getClientRects().length,
      );
      return !!h1;
    }),
    "1 2 3 at the quiet 404 reveals the page in place, no reload",
  );

  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const lock = page.locator("dialog[data-prompt] button", { hasText: "Lock" });
  check((await lock.count()) === 1, "the prompt offers a way to lock again");
  await lock.click();
  await page.waitForTimeout(400);
  check((await stored(page)) === null, "locking clears the store");
  check(
    await page.evaluate(() =>
      document.body.innerText.includes("This page could not be found"),
    ),
    "and the page goes back to being missing, in place",
  );
  await context.close();
}

/* -------------------------------------------------------------------------- */
console.log("\nthe pre-hydration half-frame, at 200kb/s");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (k) => window.localStorage.setItem(k, JSON.stringify({ unlockedAt: new Date().toISOString() })),
    GATE_KEY,
  );

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: (200 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
  });

  await page.goto(`${ORIGIN}/check`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const frames = await framesOf(page);
  const flashed = frames.filter((f) => f[1] === true);
  check(
    flashed.length === 0,
    "an unlocked reader on a slow connection never sees the 404",
    `${frames.length} frames sampled, ${flashed.length} showed it`,
  );
  if (flashed.length) console.log(`       first at ${flashed[0][0]}ms, last at ${flashed.at(-1)[0]}ms`);
  check(
    frames.some((f) => f[2] !== null),
    "and the page does arrive",
    frames.at(-1)?.[2] ?? "nothing",
  );

  await context.close();
}

/* -------------------------------------------------------------------------- */
console.log("\nwhat still gives it away (reported, not asserted)");
/* -------------------------------------------------------------------------- */
{
  const context = await fresh();
  const page = await context.newPage();
  const look = async (route) => {
    const response = await page.goto(`${ORIGIN}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const title = await page.evaluate(() => document.title);
    return `${String(response?.status() ?? "?").padEnd(4)} ${JSON.stringify(title)}`;
  };
  console.log(`  a genuinely missing route  ${await look("/no-such-page-here")}`);
  for (const route of GATED) console.log(`  locked ${route.padEnd(19)} ${await look(route)}`);
  console.log(
    "  A locked route answers 200 where a missing one answers 404: the server cannot\n" +
      "  see a secret that lives in localStorage. Every route that exports its own\n" +
      "  metadata also keeps its tab title over the 404 body. Both are written up in\n" +
      "  components/gate/gate.tsx.",
  );
  await context.close();
}

await browser.close();
console.log(
  failures === 0
    ? `\nAll ${checks} checks passed. The curtain hangs, and it opens.`
    : `\n${failures} of ${checks} checks failed.`,
);
process.exit(failures === 0 ? 0 : 1);
