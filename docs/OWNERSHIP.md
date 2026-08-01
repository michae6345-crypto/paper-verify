# File ownership

Multiple agents work in `C:\researchtool` **simultaneously, in one shared directory**.
There is no worktree isolation. The only thing preventing lost work is this map.

## Rules

1. **Write only inside the paths you own.** Read anything.
2. **Never edit `backend/pv/models.py`.** It is the shared contract. If you need a field
   it lacks, say so in your final report — the orchestrator adds it and tells everyone.
3. **Never edit files owned by another agent**, even to fix an obvious bug. Report it.
4. **Commit only your own paths**, with `git add <your paths>` — never `git add -A`,
   never `git commit -a`. Another agent's half-finished work is probably staged.
5. If you need something that doesn't exist yet from another workstream, **stub it
   against the contract** and move on. Do not wait, and do not build it yourself.
6. Shared config files (`.gitignore`, `.env.example`, `pyproject.toml`, `package.json`)
   are orchestrator-owned. Request additions; don't add them.

## Map

| Owner | Paths | Depends on |
| --- | --- | --- |
| Orchestrator | `backend/pv/models.py`, `CLAUDE.md`, `docs/`, root config, `fixtures/` | — |
| A — Ingest | `backend/pv/ingest/**`, `tests/test_ingest.py` | contract |
| B — Table parser | `backend/pv/parse/**`, `tests/test_parse.py` | contract |
| C — Checks 1 & 3 | `backend/pv/checks/bold_extreme.py`, `backend/pv/checks/row_arithmetic.py`, `backend/pv/checks/registry.py`, `tests/test_checks_arith.py` | contract (not B's code) |
| D — Links & citations | `backend/pv/checks/links.py`, `backend/pv/checks/citations.py`, `backend/pv/checks/repos.py`, `backend/pv/adapters/http.py`, `tests/test_links.py` | contract |
| E — Frontend | `frontend/**` | contract → generated types |

## Interface points

Everything meets at `backend/pv/models.py`:

- **A → B**: A produces `SourceDocument` (assembled LaTeX + macro table). B consumes it.
- **B → C**: B produces `list[Table]` of `Cell`/`Column`. C consumes it. C must code
  against the *model*, not against B's implementation, and must test with hand-built
  `Table` objects so it can finish before B does.
- **C, D → runner**: every check exposes
  `run(ctx: CheckContext) -> CheckResult` and module-level `CHECKER_NAME` /
  `CHECKER_VERSION`. C owns `registry.py`, which discovers them.
- **E**: builds against static JSON fixtures matching `RunReport`. **E does not wire to
  a live backend** — see below.

## Why the frontend may start early

The brief (§11) says: do not build the UI before step 1 produces correct output. We are
honouring the intent, not the letter. Agent E builds the design system, layout, and the
gutter against **static `RunReport` fixtures only**, with no connection to the checker.
Nothing gets wired to live data until checks 1–3 are validated against real papers. The
risk §11 guards against — a polished interface flattering an incorrect checker — cannot
occur while the two are not connected.
