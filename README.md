# paper-verify

Checks whether an ML paper's own numbers agree with each other, and reports
discrepancies with evidence.

It does **not** judge whether a paper is good, novel, or true.

---

## The rule that governs everything

**A language model never produces a verdict.** Models extract structure only. Every
verdict is computed by deterministic Python from that structure. A check that cannot be
made deterministic returns `unverifiable` with a reason code — it never guesses.

Checks 1, 2, 3 and 6 are the entire first release and **none of them call a model.**

The corollary matters as much: **honest incompleteness is the product.** A run where half
the checks are `unverifiable` with clear reasons is a success. The "not checked" section
is a first-class part of the report, not an error state.

## Try it

```bash
pip install pydantic httpx TexSoup fastapi uvicorn sse-starlette pytest

# Headless, against a real paper. First run fetches from arXiv and caches.
cd backend && python -m pv.cli 1706.03762

# Or against the committed corpus, with no network at all:
python -m pv.cli --corpus ../fixtures/papers
```

```
Attention Is All You Need
1706.03762   4 tables parsed

  — Bolded value is the best in its block   matches
  · Average columns match their row         not checked
  — Dead links                              matches
  ○ Citation existence                      unverifiable  (reference_not_indexed)

Not checked (2)
  Average columns match their row — no_applicable_claims
  Citation existence — reference_not_indexed
```

### API and UI

```bash
cd backend && uvicorn pv.api.app:app --reload        # :8000
cd frontend && npm install && npm run dev            # :3000
```

`POST /runs` returns immediately; `GET /runs/{id}/stream` emits one SSE event per check
as it completes. Deployment: `docs/DEPLOY.md`.

## Status

| | |
| --- | --- |
| Checks 1, 2, 3, 6 | Implemented, validated against 10 papers |
| Tests | 391, network-free |
| False findings on the corpus | **0** |
| API | Complete — runs, SSE streaming, repository candidates |
| Frontend | Design system, shell, submit and run views; gutter in progress |
| Persistence | **In memory.** Restarts lose runs; permalinks 404 |
| Checks 4, 5, 7 | Not started — these are the ones needing a model |

## What the corpus taught us

Every serious defect found in this codebase has the same shape: **a lossy reading of the
source that silently produces a confident accusation.** Six instances so far, all caught
before shipping:

- Reading BERT's `86.7/85.9` as one number → five false divergences on the GLUE table.
- Matching a citation by title containment → "Attention is all you need" matched "Is
  Attention All You Need?", which would have attributed another paper's retraction.
- Comparing a bolded value against its whole column instead of its rule-delimited block
  → a false divergence on the Transformer paper.
- Reading `all` in a header as "average" → six false divergences on ELMo, whose "All
  layers" column is a grouping. **This one came from a specification, not from code.**
- Letting `\includegraphics[width=.83\linewidth]` reach the number scanner → a figure
  layout dimension reported as a data value.
- A nested line-break tabular stealing its parent table's `\label` → findings that point
  at the wrong table.

When a step narrows or normalises data, ask what it discards and whether a verdict could
rest on the discarded part. If it could, the answer is `unverifiable` with a reason code
— plus the comparison attached as evidence, so the user still sees the numbers even when
we decline to call the paper wrong.

## Layout

```
backend/pv/models.py     the contract — every workstream meets here
backend/pv/ingest/       arXiv fetch, \input resolution, macro table
backend/pv/parse/        LaTeX tabular -> Table, with bold and block detection
backend/pv/checks/       the checks, plus the registry that runs them
backend/pv/api/          FastAPI + SSE
frontend/                Next.js, design system, app shell
fixtures/GROUND_TRUTH.md hand-derived answers the checkers must reproduce
docs/BRIEF.md            the full design and build brief
```

`fixtures/papers/` holds ten papers' LaTeX as test fixtures — see
[PROVENANCE.md](fixtures/papers/PROVENANCE.md) for attribution and licensing.
