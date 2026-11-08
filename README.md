# paper-verify

Checks whether an ML paper's own numbers agree with each other, and reports any
disagreement with the evidence attached. It does not judge whether a paper is good,
novel, or correct.

Verdicts come only from deterministic Python. Planned checks may use a model to
extract structure, but a model never decides a verdict. When a check cannot decide
deterministically, it returns `unverifiable` with a reason code.

## Checks

Specified in [docs/BRIEF.md](docs/BRIEF.md) §9. Four are implemented, and none of
them calls a model.

| # | Check | Module (`backend/pv/checks/`) | Status |
| --- | --- | --- | --- |
| 1 | Bolded value is the best in its block | `bold_extreme.py` | Implemented |
| 2 | Dead links (one HTTP request per URL) | `links.py` | Implemented |
| 3 | Average columns match their row | `row_arithmetic.py` | Implemented |
| 4 | Abstract numbers match the tables | | Not started |
| 5 | Missing variance on comparative claims | | Not started |
| 6 | Citation existence (Crossref, OpenAlex) | `citations.py` | Implemented |
| 7 | Cited baselines match their source paper | | Not started |

Each result is `matches`, `within tolerance`, `diverges`, `unverifiable`, or
`not checked`.

## Run it

Python 3.11 or newer.

```bash
pip install pydantic httpx TexSoup fastapi uvicorn sse-starlette pytest pytest-asyncio
cd backend
python -m pv.cli 1706.03762        # fetch from arXiv (cached), run all four checks
python -m pv.cli --fixture ../fixtures/papers/1706.03762 --offline 1706.03762
python -m pv.cli --corpus ../fixtures/papers --checks bold_extreme,row_arithmetic
```

`--offline` only skips the arXiv fetch; the link and citation checks still make HTTP
requests. The last command, limited to checks 1 and 3, uses no network. Output of the
second command:

```
Attention Is All You Need
1706.03762   4 tables parsed

  — Bolded value is the best in its block matches
  · Average columns match their row    not checked
  — Dead links                         matches
  ○ Citation existence                 unverifiable       (reference_not_indexed)

Not checked (2)
  Average columns match their row — no_applicable_claims
  Citation existence — reference_not_indexed
```

## Tests

`pytest -q` from the repository root: 684 passed, 4 skipped, about 8 seconds on
Python 3.12 with no network. The skipped tests need a live Postgres (`DATABASE_URL`).
CI also runs `python fixtures/make_reports.py --verify`, which re-runs checks 1 and 3
on the committed papers and fails if any report differs from `fixtures/reports/`.

Checks 1 and 3 report no `diverges` on the ten papers in `fixtures/papers/`. Misreadings
caught during development, each now covered by a test in `tests/`:

- BERT's `86.7/85.9` read as one number.
- A bolded Transformer value compared against its whole column instead of its ruled block.
- ELMo's "All layers" column read as an average.
- `\includegraphics[width=.83\linewidth]` read as a data value.
- Citation titles matched by substring, so "Attention is all you need" matched another paper.

## API and frontend

```bash
cd backend && uvicorn pv.api.app:app --reload     # :8000
cd frontend && npm install && npm run dev         # :3000
```

`POST /runs` starts a run; `GET /runs/{id}/stream` sends one server-sent event per
finished check. Routes that change state or return unredacted findings need an operator
key. Storage is in memory unless `DATABASE_URL` points at Postgres. Deployment:
[docs/DEPLOY.md](docs/DEPLOY.md).

## Layout

```
backend/pv/ingest/   arXiv fetch, \input resolution, macro table
backend/pv/parse/    LaTeX tabular parsing, bold and block detection
backend/pv/checks/   the checks and the registry that runs them
backend/pv/api/      FastAPI app and SSE stream
frontend/            Next.js app
```

`fixtures/papers/` holds the LaTeX source of ten papers used as fixtures; attribution
and licensing are in [PROVENANCE.md](fixtures/papers/PROVENANCE.md).
