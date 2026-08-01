/**
 * Copy the generated report fixtures into the frontend so the app is
 * self-contained.
 *
 * Why this exists: `src/lib/reports.ts` used to read `../fixtures/reports` at
 * build time. That works locally but not on Vercel, where the Next.js app is
 * built from `frontend/` and nothing above it exists — the deploy failed with
 * ENOENT on `/vercel/fixtures/reports`. A Next.js app should not reach outside
 * its own root for build inputs.
 *
 * The copies are committed, the same way generated TypeScript types are. CI
 * runs this and fails on a diff, so they cannot drift from `fixtures/reports/`.
 *
 * Source of truth is still `python fixtures/make_reports.py`. This only mirrors.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "..", "..", "fixtures", "reports");
const DEST = join(here, "..", "src", "fixtures", "reports");

// This runs as `prebuild`, including on Vercel, where only `frontend/` is
// uploaded and the source directory does not exist. The committed copies are
// already correct there, so skipping is the right outcome — not an error.
if (!existsSync(SOURCE)) {
  console.log("no ../fixtures/reports here; using the committed copies");
  process.exit(0);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

const files = readdirSync(SOURCE).filter((f) => f.endsWith(".json"));
for (const file of files) {
  copyFileSync(join(SOURCE, file), join(DEST, file));
}

console.log(`synced ${files.length} fixtures -> src/fixtures/reports`);
