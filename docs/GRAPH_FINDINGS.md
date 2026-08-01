# Graph findings

Answers to the five questions, from a Graphify code graph built over the repo root
with `graphify extract . --code-only` (local AST, no LLM, no API key).

**Graph:** 1,873 nodes, 4,336 edges, 91 communities. 126 code files.
**Built at:** commit `56fc301`, with Agent I's orchestrator work still uncommitted in
the tree — so it includes `orchestrator.py`, `adapters/circuit.py` and the API changes.

Rebuild with `graphify extract . --code-only && graphify cluster-only .`

> Scope: Graphify is development tooling. Nothing under `backend/` imports it, and it
> never runs against a submitted paper. Its doc/PDF pass produces `INFERRED` edges;
> adjudication here is deterministic by design. The `--code-only` build used here
> emits `EXTRACTED` edges from AST parsing only.

---

## 1. Call sites of `Claim` — refuted, but the premise was true when written

**39 edges across 8 files.** `Claim` is now the **4th most connected node in the repo**,
behind `SourceDocument` (59), `CheckContext` (58) and `Orchestrator` (42).

| File | How it uses `Claim` |
| --- | --- |
| `claims/mine.py` | `mine()`, `mine_body_numbers()`, `mine_links()`, `mine_citations()` |
| `checks/_cells.py` | `table_claims()`, `resolve()` |
| `checks/bold_extreme.py` | `applies()`, `_observation()`, `observe_table()`, `observe()` |
| `checks/row_arithmetic.py` | `applies()`, `_observation()`, `observe_table()`, `observe()`, `_judge_table()` |
| `checks/citations.py` | `citation_claims()`, `_claim()` |
| `checks/links.py` | `link_claims()`, `_claim()` |
| `orchestrator.py` | imported; used by `Orchestrator`, `RunState`, `RunOptions`, the state stores |
| `tests/test_claims.py` | — |

The belief that there were zero call sites was **correct when `ARCHITECTURE.md` §14.0 was
written**. Agent H closed it in commit `56fc301` ("Claims become data, and the tolerance
band becomes a policy"), which is §14.9 step 2. The doc is stale, not wrong.

Nothing is missing from the list of modules that *should* reference it.

## 2. Orphaned nodes in `backend/` — effectively zero

**The naive answer is 285 and it is wrong.** 441 of the graph's 1,873 nodes have
`file_type: "rationale"` — they are docstrings, which never have inbound edges. Counting
them as orphans is precisely the lossy-reading failure `CLAUDE.md` warns about.

Filtering to real code symbols: **453 backend symbols, 1 with no inbound edge**, and that
one is `pyproject.toml`'s project node. There is no dead code in `backend/pv`.

The interesting variant is **25 symbols referenced only by tests**. Most are legitimate —
test doubles and adapter internals — but these are worth a look:

| Symbol | File |
| --- | --- |
| `CircuitBreaker` | `adapters/circuit.py` — Agent I's §14.7 work, not yet wired to a caller |
| `parse_policy_file()`, `load_policy()`, `Rule` | `adjudicate.py` |
| `find_repository_mentions()` | `checks/repos.py` — public by design, for explaining rank |
| `MemoryStateStore`, `FileStateStore` | `orchestrator.py` — selected by env, so the edge is dynamic |

`FileStateStore` and `MemoryStateStore` are chosen at runtime from `PV_STATE_DIR`, which
AST analysis cannot see. Not orphans; a limitation of static extraction.

## 3. Registry discovery → persistence, and where judgement still happens

```
Orchestrator.advance()            orchestrator.py:432
  └─ registry.run_all()           checks/registry.py:175
       └─ discover()              checks/registry.py:101   ── _is_check_module() :93
       │                                                   └─ _missing()        :97
       └─ run_check()             checks/registry.py:143
            └─ <module>.run(ctx)  e.g. bold_extreme.py:396
                 ├─ applies()     per claim
                 ├─ observe()     per claim → Observation      (no verdict)
                 ├─ adjudicate()  adjudicate.py:226 → verdict  (policy applied)
                 └─ roll-up       ← VERDICT ASSIGNED HERE
  └─ store.append_check()         api/store.py:162
```

**Invariant 2 (§14.1) is satisfied per claim and violated per check.**

`observe()` is clean — it returns an `Observation` with no judgement, and `adjudicate.py`
applies the policy. But the roll-up from many adjudicated claims to the single
`CheckResult.verdict` still happens **inside the checker module**:

- `checks/bold_extreme.py:432–439` — assigns `Verdict.DIVERGES` / `MATCHES` /
  `UNVERIFIABLE` / `NOT_ATTEMPTED` directly
- `checks/row_arithmetic.py:546–561` — same, inside `_judge_table()`

So a checker still decides what a *table* concluded, even though it no longer decides
what a *cell* concluded. The precedence rule ("any diverges wins, else any
within_tolerance, else …") is duplicated in both files rather than living in
`adjudicate.py`. Two copies of a precedence rule is how they drift.

This is a real gap against §14.1, and it is small: the roll-up is ~15 lines in each
checker and belongs in the adjudicator.

## 4. Checkers the registry could silently fail to discover — already fixed

**No longer possible.** Agent H closed this in commit `bdb14ea` ("A check that cannot be
loaded says so instead of vanishing"), §14.9 step 1. `registry.py` now carries:

- `MissingChecker` (`:54`) — a placeholder for a module that would not load
- `_is_check_module()` (`:93`) — protocol validation, so a module missing
  `CHECKER_NAME`/`run` is rejected rather than half-used
- `_missing()` (`:97`) — produces the `not_attempted / CHECKER_ERROR` row
- `_unverifiable()` (`:130`) — converts a raising checker

One residual: `repos.py` is deliberately **not** a check module (no `CHECKER_NAME`, no
`run`), so `_is_check_module()` correctly rejects it. That is intended — Agent D built it
as a data source for §5.2, not a check — but it means the same mechanism that catches a
broken checker also silently passes over an intentional non-checker. The distinction is
by convention, not by declaration.

## 5. Duplicate logic — one real instance, and it is not among the checkers

**`backend/pv/ingest/latexutil.py` and `backend/pv/parse/latexutil.py` are two modules
with the same name doing the same job, written independently by two agents in parallel.**

| Purpose | ingest (126 lines) | parse (666 lines) | Textual similarity |
| --- | --- | --- | --- |
| Mask `%` comments, preserving offsets | `mask_comments` | `blank_comments` | 25% |
| Read a balanced `{...}` | `read_group` | `read_group` | 49% |
| Read an optional `[...]` | `read_optional` | `read_bracket` | 48% |
| Read a control-sequence name | `read_control_name` | `read_cs_name` | 30% |

Same primitives, different names, different implementations. Agent A wrote the ingest
copy; Agent B wrote the parse copy. Neither imports the other.

**Why this one matters more than it looks.** These are the primitives that decide *what
text is a comment* and *where a group ends* — which is to say, they decide which
characters a number is extracted from. `CLAUDE.md` already records that a commented-out
`\newcommand` and a commented `\input` both caused real bugs. Two implementations that
disagree about what a comment is means the ingest stage and the parse stage can disagree
about the content of the same file, and the disagreement would surface as a wrong number
in a finding rather than as an error.

Lesser instances, both benign:

- `_claim()` and `_observation()` appear in both `checks/citations.py` and
  `checks/links.py`. Small adapters over different payloads; the shared shape is the
  checker protocol, not copied logic.
- `checks/_cells.py` was extracted by Agent H as the shared cell vocabulary, which is the
  correct instinct and already prevented this class of duplication among the checkers.

---

## Where I disagree with the questions

**Q1's premise is stale rather than wrong.** It was accurate when written; the graph
simply reflects work that landed since. Worth noting because `ARCHITECTURE.md` §14.0 now
describes a gap that no longer exists, and an agent reading it would act on stale
information.

**Q2 asked the wrong question for this graph.** "Defined but never referenced" returns
285 nodes, 284 of which are docstrings. The answer that matters is "referenced only by
tests," which is 25 and includes at least one genuinely unwired component
(`CircuitBreaker`).

**Q5 pointed at the checkers; the duplication is upstream.** The checkers are clean —
Agent H's `_cells.py` extraction saw to that. The duplication is between `ingest/` and
`parse/`, written by two agents who never read each other's code, and it sits on the
most correctness-sensitive path in the system.

## What the graph found that the code audit missed

The two `latexutil.py` modules. I had read both files' owners' reports, run their tests,
and reviewed their commits, and never noticed that two modules with the same filename
implement the same four primitives — because nothing ever imports both, so no single file
read reveals it. It is only visible from a whole-repo view.

The corollary is uncomfortable and worth stating: **the file-ownership discipline that
made parallel agents safe is also what produced this.** Agents A and B were correctly
forbidden from editing each other's directories, so when both needed to mask LaTeX
comments, each wrote their own. Ownership boundaries prevent collisions and manufacture
duplicates, and only a cross-cutting view catches the second effect.

## Not done

`--postgres` was not used. It expects a live DSN and Docker is not installed, so there is
no local pgvector instance to introspect. Once §14.9 step 5 lands a database, rebuild
with `graphify extract . --code-only --postgres "$DATABASE_URL"` and the schema will land
in the same graph as the code that touches it.
