# paper-verify — frontend

Next.js App Router, TypeScript, Tailwind v4, shadcn/ui, Framer Motion.

```bash
npm install
npm run dev             # http://localhost:3000
npm run types:generate  # regenerate src/types/run-report.ts from the schema
npm run lint
npm run build
```

## There is no backend connection, on purpose

BRIEF §11 forbids wiring a UI to the checker before the checker is proven, and
`docs/OWNERSHIP.md` holds this workstream to static fixtures. Everything renders from
`fixtures/reports/` — four real `RunReport` files, plus `synthetic.json`, which is the
only fixture containing a `diverges`.

`src/lib/reports.ts` is the single place that reads them. When the FastAPI SSE endpoint
lands, that module changes and nothing else does.

Reports are looked up by their `arxiv_id` field, not by filename — `synthetic.json`
holds `0000.00000`, so the two do not always agree.

## Types are generated, never hand-written

`src/types/run-report.ts` is generated from `fixtures/reports/run-report.schema.json`,
which the backend emits from `backend/pv/models.py` (BRIEF §8). Do not edit it. After the
orchestrator regenerates the schema, run `npm run types:generate`.

## Where the design system lives

`src/app/globals.css` holds every token from §3 — the seven chrome colours, three paper
colours, five verdict colours, one interactive colour, the type scale, spacing, radii, and
motion durations. Nothing in the app should introduce a colour, radius, or font that is
not defined there. shadcn's semantic variables are mapped onto those tokens so the
primitives inherit the system rather than fight it.

## What is built, and what is not

Built: the design system, the app shell (§4), the submit screen (§5.1), the run view with
streaming (§5.3), and the five verdict glyphs.

Not built, deliberately — the next wave depends on this foundation:

- **The gutter marks.** The 48px column is real and reserved. The seam, and the contract
  for filling it, is documented at the top of `src/components/shell/gutter.tsx`.
- **Document pane rendering.** `src/components/run/document-pane.tsx` has the surface,
  measure, and typography settled; the paper's source and its anchors are missing.
- **Finding-detail sync** (§5.4's three simultaneous effects) and the **report
  permalink** (§5.5).

## Designing for the normal case

Across the ten validated papers the checker produces **no** `diverges` at all. Real
reports are dominated by `matches`, `unverifiable`, and `not checked`. That is the product
working: §5.5 makes honest incompleteness the core value proposition. So the verdict
pane's resting state is the "not checked" list, not an empty frame, and every reason code
has a human-readable label in `src/lib/verdict.ts`. The raw enum is never shown.

If the interface looks broken when most checks are unverifiable, the design is wrong.
