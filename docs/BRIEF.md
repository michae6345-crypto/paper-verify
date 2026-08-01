# Design & build brief — paper verification app

Context document for an autonomous coding agent. Read fully before writing code.

---

## 1. What this product is

A web app that checks whether a machine learning paper's own numbers agree with each
other, and — where a code repository is available — whether the paper's reported results
match what the code produces.

It does **not** decide whether a paper is good, novel, or true. It reports discrepancies
with evidence. This distinction governs every copy and UI decision below.

**Primary user:** an ML researcher checking their own draft before submission.
**Secondary user:** a program chair or artifact-track reviewer triaging a batch.
**The page's single job:** show a researcher exactly which of their claims don't line up,
and prove it.

### Core flow
1. User submits an arXiv ID or URL.
2. System fetches the LaTeX source, extracts tables, claims, citations, and links.
3. System proposes candidate code repositories found in the paper; user confirms one or
   supplies their own.
4. Checks run as background jobs, streaming results into the UI as each completes.
5. User gets a report: graded verdicts, evidence for each, and an explicit list of what
   could not be checked.

---

## 2. Design direction

### The idea
Two materials, held against each other: **the document** and **the machine**. The paper
is warm, light, typeset, serif — a real artifact. The verification chrome is cool, dark,
dense, monospaced — an instrument examining it. The interface is the seam between them.

Do not unify these into one surface. The contrast is the concept.

### Signature element — build this, it is the thing the product is remembered for

**The margin gutter.** A narrow vertical strip (48px) running between the document pane
and the verdict pane. Verdict marks appear in it, vertically aligned to the exact line,
table, or cell they refer to — the way a proofreader's marks sit in a manuscript margin.

- Each mark is a small glyph, not an icon-library icon: a thin horizontal rule for
  `matches`, a short diagonal stroke for `diverges`, a hollow circle for `unverifiable`.
- Clicking a mark scrolls the document pane to the anchor and expands the corresponding
  verdict on the right. Both panes stay in sync on scroll.
- The gutter is the primary navigation of the report. It is not decoration.

Spend the design boldness here. Everything else stays quiet.

### Explicitly forbidden
These read as AI-generated and will get the design rejected:
- Purple-to-blue gradients, mesh gradients, gradient text, glowing orbs, aurora backgrounds
- Glassmorphism, frosted blur panels
- Drop shadows for elevation (use 1px borders)
- Fully-rounded pill buttons everywhere
- Emoji anywhere in the product UI
- Centered marketing-style hero inside the app
- Sparkle iconography, "✨ AI-powered" language
- Generic empty-state illustrations of people or boxes
- Cream background with terracotta accent
- Confetti, typewriter text effects, parallax scroll

---

## 3. Tokens

### Color

Chrome (application surfaces — always dark):

| Token | Hex | Use |
|---|---|---|
| `--chrome-base` | `#14181D` | App background |
| `--chrome-panel` | `#1B2027` | Panels, rails, cards |
| `--chrome-raised` | `#222932` | Hover, selected row |
| `--chrome-line` | `#2A323C` | All borders, 1px |
| `--chrome-text` | `#E4E7EB` | Primary text |
| `--chrome-dim` | `#8B95A1` | Secondary text, labels |
| `--chrome-faint` | `#5A646F` | Tertiary, disabled |

Document (paper pane — always light, never inverts):

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FBFAF8` | Document background |
| `--paper-ink` | `#16191D` | Document body text |
| `--paper-rule` | `#DDD9D2` | Table rules, dividers |

Verdict semantics (used in both surfaces, never for branding):

| Token | Hex | Meaning |
|---|---|---|
| `--v-matches` | `#2F9E68` | Claim confirmed |
| `--v-tolerance` | `#7B9E4A` | Within stated tolerance |
| `--v-diverges` | `#D6453D` | Claim contradicted by evidence |
| `--v-unverifiable` | `#C08A2E` | Could not be checked |
| `--v-pending` | `#5A646F` | Not yet run |

Interactive:

| Token | Hex | Use |
|---|---|---|
| `--focus` | `#6A7BFF` | Focus rings, selected state, links |

Rules: exactly one interactive color. Verdict colors never appear on buttons, logos, or
headers — only on verdicts. Every verdict color is paired with a distinct glyph so the
UI is legible without color.

### Type

Load from Google Fonts:
- **Instrument Sans** — all application UI. Not Inter, not Geist.
- **Source Serif 4** — the document pane only. Papers are set in serif; honor that.
- **IBM Plex Mono** — every number, every identifier, every log line, every table cell.

Scale (application chrome):

| Role | Size / line-height / weight |
|---|---|
| Section label | 11px / 1.2 / 500, uppercase, `0.08em` tracking, `--chrome-dim` |
| Body | 13px / 1.5 / 400 |
| Emphasis | 13px / 1.5 / 500 |
| Panel title | 15px / 1.3 / 500 |
| Numeric | 13px / 1.4 / 400, IBM Plex Mono, `font-variant-numeric: tabular-nums` |

`tabular-nums` on every numeric element is mandatory. Columns of figures that don't align
are the fastest way to make a data product look amateur.

Document pane: Source Serif 4, 17px / 1.65, max measure 68ch.

### Space and shape
- 4px base unit. Spacing steps: 4, 8, 12, 16, 24, 32, 48.
- Radius: 6px on panels and inputs, 4px on chips and small controls. Never fully rounded.
- Borders: 1px `--chrome-line`. No shadows anywhere in the app chrome.
- Density target: a run with 12 checks fits on a 900px-tall viewport without scrolling.

---

## 4. Layout

Three regions, left to right:

```
┌────┬─────────────────┬──────────────────────────────────────────┐
│    │  RUN RAIL       │  CONTENT                                 │
│ N  │  280px          │  fluid                                   │
│ A  │                 │  ┌──────────────┬──┬────────────────────┐│
│ V  │  paper header   │  │  DOCUMENT    │G │  VERDICT           ││
│    │  ───────────    │  │  paper pane  │U │  detail pane       ││
│ 56 │  check rows     │  │  light       │T │  dark              ││
│ px │  (streaming)    │  │  serif       │T │  mono              ││
│    │                 │  │              │E │                    ││
│    │  ───────────    │  │              │R │                    ││
│    │  not checked    │  │              │  │                    ││
│    │  (count)        │  └──────────────┴──┴────────────────────┘│
└────┴─────────────────┴──────────────────────────────────────────┘
```

- Nav rail: 56px, icon-only, tooltip on hover.
- Run rail: 280px fixed. Contains the check list. This is where streaming happens.
- Document pane and verdict pane: resizable split, default 55/45. Gutter is 48px, fixed,
  between them.
- Below 1100px: verdict pane becomes a bottom sheet. Below 760px: single column, gutter
  marks collapse into inline badges.

---

## 5. Screens

### 5.1 Submit
Single centered input, 480px wide, on `--chrome-base`. Placeholder: `arXiv ID or URL`.
No hero, no marketing copy, no feature grid. One line of helper text below in
`--chrome-dim`: `Checks the paper's tables, citations, and links against each other.`

Recently checked papers listed below as a plain table: title, date, verdict summary as a
row of gutter glyphs. Not cards.

### 5.2 Repository confirmation
After fetch, show candidate repos found in the paper as a vertical list of rows (not
cards): repo path in mono, stars, last commit date, and the location in the paper where
the link appeared (e.g. `§4.1, footnote 3`). One is preselected if confidence is high.

A final row: `Use a different repository` with an inline input.
A final option: `Continue without code` — this is a legitimate path, not a failure. Make
it visually equal, not de-emphasized.

### 5.3 Run view
The check list streams. Each row: glyph, check name, and a right-aligned status. States:

- `pending` — `--v-pending`, glyph at 40% opacity
- `running` — name in `--chrome-text`, a 1px indeterminate progress line under the row
- complete — verdict glyph in its semantic color, plus a count (`3 findings`)

Rows appear as their results land. Never render the full list greyed out in advance — the
user should watch the work accumulate.

At the top of the rail: the paper title, arXiv ID in mono, and elapsed time.

### 5.4 Finding detail — the core screen
Selecting a finding does three things at once:
1. Document pane scrolls to the anchor and applies a highlight to the exact table cell
   or sentence (background `#FFF3C4`, 1px `--v-diverges` outline if divergent).
2. Gutter mark for that finding becomes filled/active.
3. Verdict pane shows the evidence.

Verdict pane content, in order:
- Verdict chip (glyph + word, e.g. `⁄ Diverges`)
- The claim, quoted, in serif
- A monospace comparison block:

```
claimed     87.4
computed    84.1
delta       −3.3
source      Table 3, row 2, column "Ours"
```

- The check that produced it, with a one-line plain-English description of what it does
- `Report this as incorrect` — always present, always one click

### 5.5 Report
Permalink page. Verdict summary as a horizontal strip of gutter glyphs (a visual
fingerprint of the paper). Findings grouped by severity. **The "not checked" section is
first-class and appears above the fold**, listing each thing that could not be verified
and the specific reason (`no code repository`, `dataset not public`, `table structure not
parsed`). This section is what makes the tool trustworthy — do not hide it.

---

## 6. Motion

Framer Motion. Restrained. Motion exists to explain state changes, not to decorate.

| Moment | Spec |
|---|---|
| Check row enters | opacity 0→1, y 4→0, 180ms, `easeOut`, 60ms stagger between rows |
| Verdict chip resolves | scale 0.96→1, 140ms, `easeOut`. No bounce, no spring overshoot |
| Pane resize | Framer `layout` prop, 200ms |
| Document jump-to-anchor | scroll 300ms `easeInOut`, then highlight background fades in over 200ms and holds |
| Gutter mark activate | opacity and 1px stroke-width change, 120ms |
| Panel/sheet open | y 8→0 with opacity, 200ms |

Global rules:
- Nothing animates longer than 300ms.
- No spring physics with visible overshoot.
- No animation on scroll position (no reveal-on-scroll, no parallax).
- Wrap everything in a `prefers-reduced-motion` guard that reduces to opacity-only or
  no transition.
- Streaming check rows are the *only* place with staggered entrance. Using stagger
  elsewhere dilutes it.

---

## 7. Copy rules

- Sentence case everywhere. No Title Case, no ALL CAPS except the 11px section labels.
- Active voice. Buttons say what happens: `Run checks`, not `Submit`.
- An action keeps its name through the flow: the `Run checks` button produces a `Checks
  running` state and a `Checks complete` result.
- Never call a finding an error, a problem, or misconduct. The vocabulary is:
  `matches`, `within tolerance`, `diverges`, `unverifiable`.
- Errors state what happened and what to do: `Couldn't fetch source for 2401.01234 —
  arXiv has no LaTeX source for this paper. Try uploading the PDF.` Never apologize,
  never be vague.
- Empty states are invitations: `No papers checked yet. Paste an arXiv ID to start.`
- Name things by what the user controls, not by system internals. `Code repository`, not
  `artifact ingestion source`.

---

## 8. Stack

**Frontend:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui as the component base,
Framer Motion for the transitions in §6, Radix primitives via shadcn for menus and
dialogs. Deploy on Vercel.

**Backend:** Python, FastAPI. Pydantic models are the contract between backend and
frontend — generate TypeScript types from the OpenAPI schema, do not hand-write them.

**Data:** Postgres via Supabase, with `pgvector`. Supabase Storage for run logs and
fetched artifacts. Supabase Auth.

**Jobs:** `arq` (Redis-backed async workers). Each check is its own job.

**Streaming:** workers write a row into `checks` as each completes; the frontend subscribes
to that table with Supabase Realtime. No websocket code, no polling.

**Sandbox (phase 2 only):** E2B for untrusted code execution.

**Models:** Claude or Gemini via API, with `instructor` or `pydantic-ai` for schema-validated
extraction.

### Hard architectural rule
**A language model never produces a verdict.** Models are used only to extract structure
(which cells are in this table, which claim refers to which cell, which script runs this
experiment). Every verdict is computed by deterministic Python from that structure. If a
check cannot be made deterministic, it returns `unverifiable`, not a guess.

This is not a stylistic preference. A probabilistic verdict published about a named
researcher is a liability.

---

## 9. Checks to implement, in order

| # | Check | Method | Needs a model? |
|---|---|---|---|
| 1 | Bolded value is not the column max | Parse `tabular`, find `\textbf` cells, compare | No |
| 2 | Dead links | Regex URLs, HTTP HEAD each | No |
| 3 | Row arithmetic | Verify `avg`/`mean` columns equal the mean of their row | No |
| 4 | Abstract vs table | Extract abstract numbers, match to cells, verify deltas | For matching only |
| 5 | Missing variance | Detect comparative claims where no seeds/CI/std are reported | For claim detection only |
| 6 | Citation existence | Crossref / OpenAlex lookup, plus retraction check | No |
| 7 | Baseline fidelity | Compare cited baseline numbers to the source paper's own reported values | Retrieval |

Ship 1–3 first. They are pure arithmetic, cannot hallucinate, and are enough to prove
the product works.

---

## 10. Data model

Core tables. Append-only: a check result is never updated, only superseded by a newer
row with a later `checker_version`.

- `papers` — arxiv_id, title, venue, fetched_at, source_hash
- `tables` — paper_id, label, caption, cells (jsonb), latex_source, anchor
- `claims` — paper_id, kind, locator, verbatim, normalized (jsonb), embedding (vector)
- `artifacts` — paper_id, kind, url, commit_sha, resolved_at, status
- `runs` — paper_id, artifact_id, started_at, finished_at, status
- `checks` — run_id, claim_id, checker, checker_version, verdict, created_at
- `findings` — check_id, severity, claimed, computed, delta, anchor, explanation
- `not_checked` — run_id, reason_code, detail

`verdict` is an enum: `matches | within_tolerance | diverges | unverifiable | not_attempted`.
There is no boolean pass/fail anywhere in the schema.

---

## 11. Build order

1. Headless backend: fetch arXiv source → parse tables → run checks 1–3 → print findings
   to stdout. Verify against 10 papers by hand before writing any UI.
2. Postgres schema + arq workers + FastAPI endpoints.
3. Frontend shell: nav rail, run rail, split panes. Static data.
4. Wire Supabase Realtime so checks stream.
5. Document pane rendering with anchors, then the gutter.
6. Finding detail sync.
7. Report permalink.

Do not build the UI before step 1 produces correct output. A polished interface over an
incorrect checker is worse than no product.

---

## 12. Quality floor

- Responsive to 390px.
- Every interactive element has a visible focus ring (`--focus`, 2px offset).
- `prefers-reduced-motion` respected on every transition.
- Keyboard: `j`/`k` move between findings, `Enter` opens, `Esc` closes the verdict pane.
- Color is never the only signal — every verdict has its own glyph.
- All numbers use `tabular-nums`.

---

## 13. Local free-tier configuration

For development and testing, every managed service in §8 has a local substitute. The
schema, API contracts, and frontend code do not change — only the adapters behind them.

### Service substitutions

| Production | Local free | Notes |
|---|---|---|
| Supabase Postgres | `pgvector/pgvector:pg16` in Docker | Identical schema, identical SQL |
| Supabase Auth | none | Single-user local mode, no login screen |
| Supabase Realtime | SSE from FastAPI (`sse-starlette`) | Same streaming UX, one endpoint |
| Supabase Storage | `./storage/` on disk | Path-compatible adapter |
| arq + Redis | FastAPI `BackgroundTasks` | No Redis needed below ~10 concurrent runs |
| Vercel | `next dev` | — |
| E2B sandbox | local Docker, `--network=none`, `--memory=2g`, `--cpus=2` | Phase 2 only |
| Hosted embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`) | Runs on CPU, 384-dim, free |
| Anthropic/Gemini API | OpenRouter `:free` routes | See constraints below |

Write every one of these behind an interface with two implementations selected by an
env var. Do not scatter `if LOCAL:` branches through the codebase.

### docker-compose.yml

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: verify
    ports: ["5432:5432"]
    volumes: ["./.pgdata:/var/lib/postgresql/data"]
```

That is the entire infrastructure requirement for local development.

### Embeddings

Do **not** call an embedding API. A corpus of a few thousand papers would exhaust any
free request budget immediately. Use `sentence-transformers` locally:

```python
from sentence_transformers import SentenceTransformer
_model = SentenceTransformer("all-MiniLM-L6-v2")  # 384-dim, CPU, ~80MB
```

Set the `pgvector` column to `vector(384)` in local mode. Keep the dimension in a single
constant so switching to a hosted embedding model later is a one-line change plus a
re-index.

### LLM access via OpenRouter

OpenRouter is OpenAI-API-compatible, so the standard `openai` client works:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

resp = client.chat.completions.create(
    model=os.environ.get("LLM_MODEL", "openrouter/free"),
    messages=[...],
    extra_headers={
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "paper-verify",
    },
)
```

Rules for the free tier:

1. **Never hardcode a model ID.** Free routes are added and removed weekly. Read
   `LLM_MODEL` from env, default to the `openrouter/free` auto-router, and keep a
   fallback list in config.
2. **Budget: 1,000 requests/day, 20 requests/minute.** The daily ceiling is comfortable;
   the per-minute ceiling is the real constraint. Enforce it in code with a token bucket
   at 18 rpm (leave headroom) and a concurrency semaphore of 4. Hitting 429s in a loop
   is worse than running slightly slower.

   Practical envelope at this tier:

   | Workload | Calls | Feasible? |
   |---|---|---|
   | Single paper, interactive | 2–4 | Instant |
   | 200-paper validation run | ~400 | One evening |
   | 2,000-paper corpus study | ~4,000 | 4 days, or switch to a paid cheap model |

   For anything above ~500 papers, stop using `:free`. Cheap paid routes cost cents per
   thousand calls and remove the rate limit entirely — the free tier is for development,
   not for the corpus study that produces your results.

2b. **Payload size is the hidden limit.** Free routes carry provider-side tokens-per-minute
   caps that are tighter than the request caps. Never send a full LaTeX source to the
   model. Send only the extracted structure — a table's cells and caption, or the
   abstract text — typically under 2k tokens. This also improves extraction accuracy.
3. **Cache every response to disk**, keyed by SHA-256 of the full request payload. Store
   under `./.llmcache/`. During development you will re-run the same paper dozens of
   times; without caching you will burn the daily quota in an hour.
4. **Add a global `LLM_ENABLED` flag**, default true at this tier. When false,
   model-dependent checks return `unverifiable` with reason `llm_disabled` rather than
   failing. The app must remain fully usable and demoable with `LLM_ENABLED=false` —
   this is both the offline dev path and the proof that the deterministic core stands
   on its own.
5. **Handle 429 as a normal outcome**, not an error: mark the check `unverifiable` with
   reason `rate_limited` and let the run complete. Never fail a whole run on a rate limit.

### Which checks need a model

| Check | Model calls per paper |
|---|---|
| 1. Bolded value is not column max | 0 |
| 2. Dead links | 0 |
| 3. Row arithmetic | 0 |
| 6. Citation existence | 0 (Crossref/OpenAlex, free, no key) |
| 4. Abstract vs table | 1 (batched) |
| 5. Missing variance | 1 (can share the call with #4) |
| 7. Baseline fidelity | 0 model calls, local embeddings only |

**Checks 1, 2, 3, and 6 are the whole first release and they cost nothing.** Build and
validate those before wiring OpenRouter at all.

### Other free external services

- **arXiv API** — free, no key. Be polite: 1 request per 3 seconds, set a real
  User-Agent, and cache every fetched source tarball under `./.arxivcache/` keyed by
  arXiv ID and version. Never re-fetch during development.
- **Crossref** — free, no key. Include a `mailto` parameter to get the faster pool.
- **OpenAlex** — free, no key. Same `mailto` convention.
- **GitHub API** — 60 requests/hour unauthenticated, 5,000/hour with a personal access
  token. Use a token; link-liveness checks will hit this limit fast otherwise.

### .env.example

```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/verify
STORAGE_BACKEND=local
STORAGE_PATH=./storage
QUEUE_BACKEND=inline

OPENROUTER_API_KEY=
LLM_MODEL=openrouter/free
LLM_FALLBACK_MODELS=
LLM_ENABLED=true
LLM_CACHE_DIR=./.llmcache
LLM_RPM=18
LLM_CONCURRENCY=4

EMBEDDING_BACKEND=local
EMBEDDING_DIM=384

GITHUB_TOKEN=
CONTACT_EMAIL=you@example.com
```

### What this means for the UI

Nothing changes visually, but two states become common in local mode and must look
intentional rather than broken:

- Checks returning `unverifiable / llm_disabled` — render in the normal amber verdict
  style with the reason shown. This is the `not checked` section from §5.5 doing its job.
- `rate_limited` — same treatment, with a `Retry this check` action on the row.

If the local build looks bad when half the checks are unverifiable, the design is wrong.
Honest incompleteness is the product's core value proposition.

---

## Addendum — corrections found during setup

Verified against live sources, 2026-07-31:

- **OpenRouter free tier is 50 requests/day**, not 1,000, unless the account has
  purchased $10 in credits lifetime — that is a permanent unlock, not a balance
  requirement, and raises the cap to 1,000/day. 20 rpm holds either way. §13's workload
  table assumes the unlocked tier.
- `openrouter/free` is real (the Free Models Router) — §13 is correct.
- A 429 that arrives mid-stream is delivered as an SSE event with
  `finish_reason: "error"`, not an HTTP 429, because the 200 was already sent.
- **Streaming does not abstract cleanly.** Supabase Realtime is a client subscribing to
  Postgres; local SSE is a server endpoint — opposite data flow, and Realtime bypasses
  the Pydantic contract that §8 makes the source of truth for types. Decision: use SSE
  in both local and hosted modes.
- **Check 1 needs metric direction and block scoping**, neither of which §9 mentions.
  See `CLAUDE.md`.
- **`not_attempted`** is in the §10 enum but absent from §7's approved vocabulary; it
  needs a user-facing label.
