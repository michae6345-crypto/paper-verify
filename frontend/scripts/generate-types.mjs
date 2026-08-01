// Generates src/types/run-report.ts from the backend's JSON Schema.
//
// The schema is emitted from backend/pv/models.py (the shared contract). Frontend
// types are never hand-written — see BRIEF §8. Run `npm run types:generate` after
// the orchestrator regenerates fixtures/reports/run-report.schema.json.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileFromFile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "..", "..", "fixtures", "reports", "run-report.schema.json");
const outPath = join(here, "..", "src", "types", "run-report.ts");

const banner = `/**
 * GENERATED FILE — do not edit.
 *
 * Source: fixtures/reports/run-report.schema.json (emitted from backend/pv/models.py).
 * Regenerate with: npm run types:generate
 */`;

const ts = await compileFromFile(schemaPath, {
  bannerComment: banner,
  additionalProperties: false,
  enableConstEnums: false,
  style: { semi: true, singleQuote: false },
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, ts, "utf8");

console.log(`Wrote ${outPath}`);
