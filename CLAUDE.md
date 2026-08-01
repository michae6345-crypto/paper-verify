# paper-verify

A web app that checks whether an ML paper's own numbers agree with each other, and
reports discrepancies with evidence. It does **not** judge whether a paper is good,
novel, or true.

Full design and build brief: `docs/BRIEF.md`. Read it before writing code.

---

## The rule that governs everything

**A language model never produces a verdict.** Models extract structure only (which
cells are in this table, which claim refers to which cell). Every verdict is computed
by deterministic Python from that structure. A check that cannot be made deterministic
returns `unverifiable` with a `ReasonCode` — it never guesses.

This is not stylistic. A probabilistic verdict published about a named researcher is
a liability.

Corollary: **honest incompleteness is the product**. A run where half the checks are
`unverifiable` with clear reasons is a success, not a failure. The "not checked"
section is first-class UI (§5.5), not an error state.

Vocabulary is fixed: `matches`, `within tolerance`, `diverges`, `unverifiable`. Never
call a finding an error, a problem, a bug, or misconduct.

---

## The contract

`backend/pv/models.py` is the shared data model and the boundary between every
workstream. **Do not edit it.** If your work needs a field it doesn't have, say so in
your final report and the orchestrator will add it. Silently adding a field breaks
everyone else in parallel with you.

Frontend types are generated from the OpenAPI schema, never hand-written.

---

## What we learned from real papers (do not relearn this the hard way)

The fixture `fixtures/papers/1706.03762/` is the Transformer paper. Its results table
breaks the naive version of nearly every check. Findings from parsing it:

**Check 1 ("bolded value is not the column max") false-positives as literally specified.**
The EN-FR column contains two bolded values — `41.29` and `41.8` — because the table is
segmented into blocks (single models / ensembles / ours) by `\specialrule`. Comparing
across the whole column flags `41.29` as wrong. It isn't; it's the best ensemble.
Therefore:
- Compare only **within rule-delimited blocks** (`\midrule`, `\hline`, `\specialrule`).
- If a block still has more than one bold in a column, return `unverifiable` /
  `MULTIPLE_BOLD_IN_COLUMN`. Do not guess.

**Metric direction is required and the brief omits it.** The same table bolds
`3.3\cdot10^{18}` in a Training Cost column — correctly, because lower is better.
Perplexity, FID, WER, MSE, loss, and error rate are all lower-is-better. Establish
direction deterministically, in this order:
1. `↑` / `↓` arrows in the column header (`\uparrow`, `\downarrow`) — the common convention.
2. A curated metric-name lookup table.
3. Otherwise `unverifiable` / `METRIC_DIRECTION_UNKNOWN`.

Still zero model calls.

**Bold appears in at least four forms**: `\textbf`, `\mathbf`, `\boldmath`, `\bf`, plus
user macros — the Transformer paper defines `\newcommand{\mbf}[1]{\mathbf{#1}}`. Bold
detection requires macro expansion, not a regex.

**Other real-world hazards in that one table**: `\multirow`/`\multicolumn` headers; an
empty **spacer column** so column index ≠ cell index; empty cells meaning "not reported",
never zero; `\citep{...}` inside label cells; `\rule{0pt}{2.0ex}` spacing junk glued to
cell content; scientific notation in math mode (`$1.0\cdot10^{20}$`); and a bolded value
inside a `\multicolumn`, which belongs to no single column
(`unverifiable` / `CELL_SPANS_COLUMNS`).

**Source is multi-file.** That paper is 8 `.tex` files joined by `\input`, and its second
table uses macros (`\dmodel`, `\dff`) defined in the main file. Resolve `\input`/`\include`
and build the macro table before parsing anything.

**There is a genuine finding in that paper.** The abstract and the results table both say
EN-FR BLEU `41.8`; the body text of `results.tex` says `41.0`. Real internal inconsistency
in the current source — our canonical end-to-end test case.

**Parser choice:** TexSoup. It parsed all three tabulars in that paper and tolerates the
malformed bits; it also parsed 50/50 in a published ML-arXiv benchmark where plasTeX
managed 11/50.

---

## Query the graph before you edit `backend/`

There is a Graphify code graph of this repo. **Query it before changing a function
signature, moving a module, or deleting anything** — it answers "who calls this" across
the whole repo, which no single file read can.

The `graphify` MCP server is registered in `.mcp.json`, so query it directly rather than
shelling out. The CLI equivalents, if you need them:

```bash
graphify affected "parse_tables" --depth 2     # who breaks if I change this
graphify explain "CheckContext"                # what a node is and what touches it
graphify query "how does a verdict reach the store" --budget 2000
graphify god-nodes --top 10                    # the hubs; change these carefully
```

`docs/GRAPH_FINDINGS.md` is a committed snapshot of what the graph says about this
codebase — read it before a refactor. Rebuild after structural changes:

```bash
graphify extract . --code-only && graphify cluster-only .
```

`--code-only` is deliberate: it uses local AST parsing with no API key and no LLM.

**Why this matters here specifically.** Ownership boundaries in `docs/OWNERSHIP.md` stop
agents colliding, and they also stop agents seeing each other's code — which is how this
repo ended up with two `latexutil.py` modules implementing the same four LaTeX primitives
in two different ways. Nothing imports both, so no file read reveals it. Only a
whole-repo view does.

**Scope: Graphify is development tooling and nothing more.** Never import it from
`backend/`, never invoke it from the verification pipeline, and never run it against a
submitted paper. Its doc/PDF pass is LLM-driven and produces `INFERRED` edges;
adjudication in this product is deterministic by construction. The two must not mix.

## The recurring bug in this codebase

Every serious defect found so far is the same shape: **a lossy reading of the source
that silently produces a confident accusation.**

- Reading `86.7/85.9` as one number → five false `diverges` on BERT's GLUE table.
- Matching a citation by title containment → "Attention is all you need" matched
  "Is Attention All You Need?", which would attribute another paper's retraction.
- Comparing a bolded value against the whole column instead of its block → a false
  `diverges` on the Transformer paper.
- Reading `all` in a column header as "average" → six false `diverges` on ELMo, whose
  "All layers" column is a grouping. This one came from a *specification*, not code.
- Letting `\includegraphics[width=.83\linewidth]` reach the number scanner → a figure
  layout dimension reported as a data value.

Whenever a step narrows or normalises data, ask what it discards and whether a verdict
could rest on the discarded part. If it could, the answer is `unverifiable` with a
reason code — plus the comparison attached as evidence, so the user still sees the
numbers even when we decline to call the paper wrong.

## Verdict labels in the UI

§7 fixes the vocabulary at `matches`, `within tolerance`, `diverges`, `unverifiable`.
`not_attempted` has no §7 label; it renders as **not checked**, matching the §5.5
section name. It is a normal outcome — a paper with no URLs, or no bibliography — and
must not read as a failure.

## Environment

- Python 3.14.3, Node 24.14.1, git. **Docker is NOT installed** — no Postgres yet.
- This does not block anything right now: build-order step 1 (fetch → parse → check →
  print to stdout) needs no database, no queue, and no UI.
- `sentence-transformers` drags in ~2GB of torch. Do not add it until check 7.

## External service etiquette (non-negotiable, we will get IP-banned otherwise)

- **arXiv**: 1 request per 3 seconds, single connection, real User-Agent. Cache every
  tarball under `.arxivcache/` keyed by id+version. Never re-fetch during development.
  Source URL: `https://arxiv.org/e-print/<id>`.
- **Crossref / OpenAlex**: free, no key, include `mailto` for the faster pool.
- **GitHub**: 60 req/hour unauthenticated. Use `GITHUB_TOKEN`.
- **OpenRouter free tier**: 20 rpm, and **50 requests/day** unless the account has
  purchased $10 in credits lifetime (which permanently unlocks 1,000/day). Token-bucket
  at 18 rpm, concurrency 4. Cache every response to `.llmcache/` keyed by SHA-256 of the
  payload. Never send full LaTeX to a model — send extracted structure only, under ~2k
  tokens. Treat 429 as a normal outcome: `unverifiable` / `RATE_LIMITED`, never fail the
  run. During a stream a 429 arrives as an SSE event with `finish_reason: "error"`, not
  an HTTP status — handle both.
- Nothing in checks 1, 2, 3, or 6 calls a model at all. That is the entire first release.

## Local vs hosted

Every managed service has a local substitute selected by an env var, behind an interface
with two implementations. Do not scatter `if LOCAL:` through the codebase.

Streaming is the exception worth knowing about: Supabase Realtime is a *client*
subscribing to Postgres, local SSE is a *server* endpoint — opposite data flow, and
Realtime bypasses the Pydantic contract. **We use SSE in both modes.**

## Style

- Sentence case in all UI copy. No emoji anywhere in the product.
- All numerics use `tabular-nums`.
- Every verdict has a distinct glyph; colour is never the only signal.
- Verdict colours never appear on buttons, logos, or headers.
