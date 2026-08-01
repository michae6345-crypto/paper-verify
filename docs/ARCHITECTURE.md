# Architecture: the acting layer

Companion to `docs/BRIEF.md`. The brief specifies *what* to build; this specifies *what
runs it*. Sections continue the brief's numbering.

Written against the repository as of the current `master`. File paths are real.

---

## 14. The orchestrator

### 14.0 What exists and what is missing

| Concern | Today | Gap |
| --- | --- | --- |
| Run execution | `pv/run.py::run_paper`, a pure function | No object owns a run over time |
| Streaming | `pv/api/jobs.py` re-walks the same stages | Two implementations of one pipeline |
| Claims | `Claim` declared in `models.py`, **never constructed** | The database thesis has no input |
| Verdicts | Checkers return `CheckResult` with a verdict | Observation and judgement are fused |
| Tolerance | ±0.05 hardcoded in `checks/row_arithmetic.py` | No `policy_version`, no replay |
| Idempotency | `registry.run_all` runs everything, always | No backfill; version bump = full reprocess |
| Persistence | `pv/api/store.py`, process-local dict | Permalinks 404; cannot scale past one worker |
| Missing checker | `registry.discover` skips it silently | A check can vanish with no row and no reason |

The last one is the most urgent and the cheapest: silent omission is precisely the
failure shape the README's "what the corpus taught us" section warns about, applied one
layer up. A skipped module must produce `NOT_ATTEMPTED / CHECKER_ERROR`, not nothing.

### 14.1 Invariants

1. **A verdict is a pure function of its inputs.**
   `verdict = f(claim_content_hash, checker_version, policy_version, artifact_commit)`
   Same inputs, same verdict, forever. This is what lets a finding be defended a year later.
2. **Checkers observe; the adjudicator judges.** A checker returns measured values and
   provenance. It does not decide `matches` or `diverges`.
3. **The two-key rule.** No model-derived structure may produce `diverges` on its own.
   Any divergence must be confirmed by deterministic recomputation, or it is
   `unverifiable`.
4. **Append-only.** Supersede by version; never mutate.
5. **Partial is normal.** A run with six of eleven checks complete is a valid result.

### 14.2 Run state machine

Currently implicit in the ordering of statements in `jobs.py`. Make it explicit and
persisted, so a run can be resumed after a restart and paused for human input.

```
queued → resolving → extracting → mining → awaiting_artifact → planning
       → checking → adjudicating → complete
                                 ↘ partial
       ↘ failed   (only from resolving/extracting)
```

`awaiting_artifact` is the state the repository confirmation screen (BRIEF §5.2) needs
and which today has nowhere to live. `checks/repos.py` finds candidates, but there is
no state in which the run waits for a choice. Give it a 10-minute timeout: on expiry the
run proceeds with `artifact = None` and code-dependent checks resolve to
`unverifiable / NO_CODE_REPOSITORY`. **A run must never block indefinitely on a human.**

`failed` stays reserved for the two stages where there is genuinely nothing to show.
Once extraction succeeds every outcome is `complete` or `partial`. This already matches
the behaviour of `run_paper`; it just needs a name.

### 14.3 Claim mining

`Claim` has zero call sites. Until it has some, every run produces a report and discards
the structured intermediate, which means ten papers processed leaves exactly as much
accumulated knowledge as zero papers processed. The linter works; the database does not
exist.

New module: `backend/pv/claims/mine.py`.

```python
def mine(document: SourceDocument, tables: list[Table]) -> list[Claim]:
    """Every checkable assertion in the paper, deterministically.

    Deterministic producers only — no model involved at this stage:
      - one claim per non-header table cell holding a value   -> kind="body_number"
      - one claim per URL found in the source                 -> kind="link"
      - one claim per bibliography entry                      -> kind="citation"

    Model-assisted producers (checks 4-5, later) append to this list; they never
    replace it, and any claim whose anchor does not resolve against `tables` is
    discarded silently.
    """
```

`Claim` gains one field, and it is the keystone of everything downstream:

```python
class Claim(BaseModel):
    ...
    content_hash: str  # sha256 over (kind, anchor.dom_id, verbatim, value)
```

Checkers change from "given the whole document, find things to check" to "given these
claims, evaluate the ones you apply to." That is a real refactor of the five existing
checks, but it is what turns each run into rows in a claims table rather than a
transient report. It is also strictly cheaper now, at five checkers, than at twelve.

Add `applies()` to the checker protocol so planning is explicit:

```python
CHECKER_NAME: str
CHECKER_VERSION: str
POLICY_KEYS: tuple[str, ...]        # which tolerance entries this checker reads
def applies(claim: Claim, ctx: CheckContext) -> bool: ...
def observe(claim: Claim, ctx: CheckContext) -> Observation: ...
```

### 14.4 Observation and adjudication

Split `CheckResult` in two. New model:

```python
class Observation(BaseModel):
    """What a checker measured. Carries no judgement."""
    claim_id: str                    # Claim.content_hash
    checker: str
    checker_version: str
    status: Literal["ok", "not_applicable", "insufficient_data", "error"]
    measured: dict                   # {"claimed": 87.4, "computed": 84.1, "unit": "pp"}
    provenance: list[Anchor]
    reason: ReasonCode | None = None
    detail: str = ""
```

New module `backend/pv/adjudicate.py` maps `Observation + policy -> CheckResult`.
`CheckResult` gains `policy_version: str`.

The payoff is concrete: the ±0.05 rounding band currently living inside
`row_arithmetic.py` moves to `policies/tolerance.yaml`, and when you revise it (publicly,
under argument, which will happen) you replay adjudication over stored observations
instead of re-running every check on every paper.

```yaml
# policies/tolerance.yaml
version: 1
default:
  rule: reported_precision          # tolerance = half the last reported decimal place
metrics:
  accuracy: {rule: reported_precision, min_abs: 0.05}
  bleu:     {rule: reported_precision, min_abs: 0.05}
  loss:     {rule: relative, pct: 1.0}
comparative:
  require_variance: true
  min_seeds: 3
```

`reported_precision` is the rule that resolves most rounding disputes and is defensible
in public: a value written `87.4` carries an implicit ±0.05. `GROUND_TRUTH.md` already
encodes exactly this for the ELMo case (70.944 vs a stated 71.0 → `within_tolerance`),
so the policy file is a lift of existing behaviour, not a change to it. Verify that by
running the corpus before and after and diffing. The outputs must be identical.

### 14.5 Idempotency and backfill

```python
def fingerprint(claim, checker, checker_version, policy_version, artifact_commit) -> str:
    return sha256("\x00".join([
        claim.content_hash, checker, checker_version,
        policy_version, artifact_commit or "",
    ]).encode()).hexdigest()
```

Store it on every `CheckResult`. Re-running a paper looks up fingerprints first and only
executes the misses. Improving a checker becomes:

1. Bump `CHECKER_VERSION`.
2. `SELECT` checks with the old version.
3. Enqueue only those.
4. Append new rows; readers take the highest version per `(claim_id, checker)`.

This is the mechanism by which accuracy compounds without reprocessing the corpus. At
ten papers it is a convenience; at two thousand it is the difference between minutes and
days.

### 14.6 The orchestrator module

New: `backend/pv/orchestrator.py`. It owns the state machine and is the single
implementation of the pipeline.

```python
class Orchestrator:
    def start(self, arxiv_id: str, *, opts: RunOptions) -> RunId: ...
    def advance(self, run_id: RunId) -> RunState:
        """Execute the next stage, persist, emit events. Idempotent and resumable."""
    def confirm_artifact(self, run_id: RunId, artifact: Artifact | None) -> None: ...
    def report(self, run_id: RunId) -> RunReport: ...
```

After this lands:
- `pv/run.py::run_paper` becomes a thin synchronous driver (`start` then `advance` to
  completion), and the CLI keeps working unchanged.
- `pv/api/jobs.py` becomes a thin async driver that publishes after each `advance`.
- The duplicated stage walk disappears. There is one pipeline with two drivers.

`run.collect_not_checked` moves into the aggregation stage as-is; it is already correct
and already shared, which is the right instinct. This just gives it a home.

### 14.7 Failure taxonomy

Already largely right in `registry.run_check`. Complete it:

| Condition | Result |
| --- | --- |
| Checker raises | `unverifiable / CHECKER_ERROR`, traceback stored, run continues |
| Checker module missing or malformed | `not_attempted / CHECKER_ERROR`, never silent |
| Stage timeout | `unverifiable / CHECKER_ERROR` with detail, run continues |
| arXiv unreachable | `failed` only if no cached source; otherwise serve cache |
| GitHub 403 | `Artifact.lookup_error` set, candidate retained (already implemented) |
| Crossref/OpenAlex down | circuit breaker opens after 5 failures → `unverifiable / NETWORK_ERROR` |
| LLM 429 | 3 backoff attempts → `unverifiable / RATE_LIMITED`, retry action in UI |

Every failure maps to a reason code. There is no generic error state and no silent drop.

### 14.8 Review gate

Any finding with `verdict == DIVERGES` and `severity == HIGH` lands in a review queue and
is **not visible on a public permalink** until released. One-click suppress with a
required reason code, and every suppression is written into `fixtures/` as a negative
fixture.

At current scale this is one person reading a list. Build it anyway: retrofitting a
review gate after something has been published is impossible, and `docs/DEPLOY.md`
already flags public-by-default permalinks as an unresolved decision. This is the
resolution.

### 14.9 Refactor order

Each step ships independently and leaves the corpus output byte-identical except where
noted.

| # | Change | Size | Corpus output |
| --- | --- | --- | --- |
| 0 | CI with corpus gate (§15.3) | 0.5 day | unchanged |
| 1 | `discover` emits `not_attempted` instead of skipping | 20 min | +1 row when a module is absent |
| 2 | `claims/mine.py`; checks iterate claims | 3–4 days | unchanged (assert this) |
| 3 | `Observation` + `adjudicate.py` + `policies/tolerance.yaml` | 2–3 days | unchanged (assert this) |
| 4 | `orchestrator.py`; `run.py` and `jobs.py` become drivers | 2 days | unchanged |
| 5 | Postgres store behind the existing three methods | 2 days | unchanged |
| 6 | `awaiting_artifact` + resume endpoint | 1 day | unchanged |

Steps 2 and 3 are the ones that convert the linter into a database. Everything after is
plumbing.

---

## 15. Deployment

`docs/DEPLOY.md` is already correct about the hard part: why the API cannot be
serverless, and what is not production-ready. This extends it to the shape a startup
needs rather than the shape a demo needs.

### 15.1 The blocking constraint

`render.yaml` pins `--workers 1`, and correctly: `store.py` fan-out is in-process, so a
second worker answers `GET /runs/{id}` for runs it has never seen, and SSE subscribers
attached to worker A never hear events published by worker B.

Scaling out therefore requires **both** a shared store and a shared event bus. Cheapest
path that avoids adding Redis: Postgres `LISTEN`/`NOTIFY`. The store writes a check row
and issues `NOTIFY run_<id>`; each web process holds one listener connection and fans out
to its local SSE subscribers. Same three-method interface, no new service.

### 15.2 Service topology

| Service | Runtime | Scale | Notes |
| --- | --- | --- | --- |
| `api` | Docker, uvicorn | 2+ after §15.1 | SSE, run lifecycle. No parsing on the event loop (already true) |
| `worker` | Same image, different entrypoint | 1–4 | Stage execution; long parses and network |
| `db` | Postgres 16 + pgvector | managed | Neon or Render Postgres |
| `web` | Next.js | Vercel | unchanged |

Splitting `worker` out of `api` is what lets you scale parse throughput without scaling
SSE connections. Keep `QUEUE_BACKEND=inline` until the shared store lands. An inline
queue with one worker is honest; an inline queue with three is a race.

### 15.3 CI and the corpus gate

There is no `.github/` directory. Given that `docs/OWNERSHIP.md` describes multiple
agents working simultaneously in one shared directory with no worktree isolation, this
is the highest-risk gap in the repository: nothing currently prevents a commit from
changing what the system accuses researchers of.

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12"}
      - run: pip install -e backend[dev]
      - run: ruff check . && mypy backend/pv
      - run: pytest -q                      # network-free; a jump in runtime
                                            # means something started making
                                            # requests
      - run: python fixtures/make_reports.py --verify   # <- the gate
```

`--verify` regenerates reports for the committed corpus and diffs them against
`fixtures/reports/*.json`. **Any change in findings fails the build** unless the expected
files are updated in the same commit. This is the only defence against an autonomous
agent "improving" a checker into producing different accusations, and it is the reason
the corpus was built.

Add a frontend job: `tsc --noEmit`, `eslint`, and `scripts/generate-types.mjs --check` so
generated types can never drift from `models.py`.

### 15.4 Migrations and environments

- Alembic, forward-only, run as a **separate gated job before** the app deploy, never in
  the same step.
- Preview per pull request: Vercel preview for `web`, ephemeral service for `api`, and a
  Neon branch for the database. Branch databases are what let an agent run migrations
  with no possibility of touching production.
- Secrets stay in the platform. `render.yaml` already does this correctly with
  `sync: false`.

### 15.5 Observability

OpenTelemetry, one span per stage and one per check. Sentry on both frontend and worker.

Product metrics from day one. These drive the roadmap:

- `unverifiable_rate_by_reason`: the one to watch. Whatever reason code dominates it is
  what to build next.
- `suppression_rate`: the closest available proxy for false-positive rate, and the
  number that decides whether public permalinks are ever safe.
- `findings_per_paper`, `verdict_distribution`, `p95_run_duration`, `cost_per_paper`,
  `tables_parsed / tables_present`.

### 15.6 Cost envelope

Render free tier + Neon free tier + Vercel hobby + OpenRouter free ≈ $0/month for
development, roughly $15–25/month once the API stops sleeping and Postgres is paid. The
sandbox tier (checks needing execution) is what changes this, and it is not on the
roadmap yet.

---

## 16. Marketing site

Reference: insforge.dev. Take the section rhythm and interaction ideas, not the
palette. The tokens in `frontend/src/app/globals.css` already define the design system;
the site uses them unchanged. No new colours, no gradients, no glassmorphism (BRIEF §2).

Route group `frontend/src/app/(site)/` so the marketing pages sit beside the app without
sharing the `NavRail` shell.

| # | Section | insforge analogue | What we do differently |
| --- | --- | --- | --- |
| 1 | Hero | mascot + CTA | Replace the mascot with a live looping miniature of the run view: check rows streaming and verdicts resolving, from real corpus output. The product demonstrating itself beats any illustration. |
| 2 | Trust strip | coding-agent logos | The sources we read: arXiv, OpenAlex, Crossref, GitHub, Hugging Face. Grayscale, slow marquee, no colour on hover. |
| 3 | Feature bento | service grid | One cell per check, unequal sizes. Each shows the check name, one sentence, and a real finding from the corpus in IBM Plex Mono. Concrete output, not abstractions. |
| 4 | Mechanism | animated branch timeline | An animated run timeline walking the §14.2 states with real intermediate artifacts appearing. This is the section a technical visitor uses to decide whether to trust us. |
| 5 | Honesty | *no analogue* | A plain statement of what the system cannot check, with the live `unverifiable_rate_by_reason` figure pulled from production. Publishing our own limitation metric is the product thesis stated in public. |
| 6 | Changelog | changelog | Four most recent entries, dated. Signals active development. |
| 7 | Stats | odometer counters | Papers checked, findings surfaced, claims in the database. `tabular-nums`, digits rolling, never counting up. |
| 8 | FAQ | accordion | Lead with the hard ones: "What if you're wrong?", "Do you contact authors?", "Is this AI detection?" (no). |
| 9 | Footer | links + status | Status, GitHub, docs, contact. |

Deliberately omit: the testimonial wall (there are no users yet, and fabricated ones are
obvious) and any "Backed by" badge not yet earned.

Motion follows BRIEF §6 without exception. The only additions permitted on the site are
the hero run-view loop, the trust marquee, and the stats odometer. All three respect
`prefers-reduced-motion`.
