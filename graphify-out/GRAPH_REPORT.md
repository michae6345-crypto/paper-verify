# Graph Report - .  (2026-08-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1873 nodes · 4336 edges · 91 communities (81 shown, 10 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 257 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `56fc3012`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test_orchestrator.py
- test_ingest.py
- run-report.ts
- test_parse.py
- test_adjudicate.py
- citations.py
- row_arithmetic.py
- test_api.py
- fetch.py
- models.py
- FakeClient
- marks.ts
- cn
- macros.py
- (site)/page.tsx
- HttpClient
- orchestrator.py
- ingest/__init__.py
- test_checks_arith.py
- parse_tables
- nav-rail.tsx
- run-view.tsx
- HttpResponse
- CheckContext
- http.py
- tabular.py
- compilerOptions
- RunState
- ingest_directory
- test_links.py
- run.py
- Orchestrator
- read_group
- FileStateStore
- assemble
- components.json
- table
- reports.ts
- _claim
- parse/latexutil.py
- devDependencies
- context
- iter_atoms
- app.py
- registry.py
- Run
- store.py
- find_repository_candidates
- dependencies
- mine
- .finish
- RunRecord
- repos.py
- _run_check
- bert_glue
- links.py
- extract_macros
- HostRateLimiter
- result_fingerprint
- table_claims
- corpus.server.ts
- fetch_corpus.py
- claim_content_hash
- (site)/layout.tsx
- load_directory
- StateStore
- scripts
- ExtractedUrl
- _result
- direction.py
- resnet_top1
- CheckEvent
- sync-fixtures.mjs
- elmo_alternate_weights
- paper_repositories
- _discover_positions
- package.json
- generate-types.mjs
- clsx
- conftest.py
- eslint.config.mjs
- next.config.ts
- @radix-ui/react-slot
- @radix-ui/react-tooltip
- react
- react-dom
- postcss.config.mjs
- paper-verify
- verdict-pane.tsx

## God Nodes (most connected - your core abstractions)
1. `SourceDocument` - 59 edges
2. `CheckContext` - 58 edges
3. `Orchestrator` - 42 edges
4. `Claim` - 39 edges
5. `RunState` - 38 edges
6. `cn()` - 38 edges
7. `FakeClient` - 37 edges
8. `ReasonCode` - 34 edges
9. `HttpResponse` - 33 edges
10. `HttpClient` - 33 edges

## Surprising Connections (you probably didn't know these)
- `test_abstract_command_form()` --calls--> `extract_abstract()`  [INFERRED]
  tests/test_ingest.py → backend/pv/ingest/metadata.py
- `_DeclinesToJudge` --uses--> `CircuitBreaker`  [INFERRED]
  tests/test_orchestrator.py → backend/pv/adapters/circuit.py
- `_SlowChecker` --uses--> `CircuitBreaker`  [INFERRED]
  tests/test_orchestrator.py → backend/pv/adapters/circuit.py
- `test_the_breaker_opens_after_five_consecutive_failures()` --calls--> `CircuitBreaker`  [EXTRACTED]
  tests/test_orchestrator.py → backend/pv/adapters/circuit.py
- `test_the_circuit_reopens_the_door_after_the_cooldown()` --calls--> `CircuitBreaker`  [EXTRACTED]
  tests/test_orchestrator.py → backend/pv/adapters/circuit.py

## Import Cycles
- None detected.

## Communities (91 total, 10 thin omitted)

### Community 0 - "test_orchestrator.py"
Cohesion: 0.06
Nodes (67): advance_to_pause(), cheap_stages(), _document(), fixture_options(), new_orchestrator(), no_network(), fixture, The run state machine (§14.2), the drivers over it (§14.6), and the failure… (+59 more)

### Community 1 - "test_ingest.py"
Cohesion: 0.04
Nodes (51): normalize_arxiv_id(), Split `1706.03762v5` into ("1706.03762", "v5"). Raises on nonsense., Output of the ingest stage: one paper's LaTeX, fully assembled., SourceDocument, corpus(), document(), no_cache_env(), fixture (+43 more)

### Community 2 - "run-report.ts"
Cohesion: 0.03
Nodes (61): Anchor, ArxivId, Block, BoldSource, Caption, Cells, CharEnd, CharStart (+53 more)

### Community 3 - "test_parse.py"
Cohesion: 0.05
Nodes (60): bert_table(), by_label(), fixture, Path, Table parser acceptance tests. Every assertion here is offline and reads a…, 41.29 is the best ensemble, 41.8 the best overall. A whole-column comparison…, `\\cmidrule{2-3} \\cmidrule{5-6}` sits between the two header rows. It covers…, The empty column between the BLEU pair and the Training Cost pair is layout,… (+52 more)

### Community 4 - "test_adjudicate.py"
Cohesion: 0.07
Nodes (49): default_policy(), judge(), load_policy(), parse_policy_file(), Policy, Path, Observation + policy -> verdict (§14.4). Invariant 2 of §14.1: **checkers…, One tolerance entry. `min_abs` is a floor on the band, never a replacement. (+41 more)

### Community 5 - "citations.py"
Cohesion: 0.08
Nodes (49): contact_email(), applies(), _bibtex_body(), citation_claims(), _claim(), claims_for(), clean_latex_text(), crossref_retraction() (+41 more)

### Community 6 - "row_arithmetic.py"
Cohesion: 0.08
Nodes (51): applies(), A bolded table cell claims to be the best value in its column. An unbolded cell…, cell_values(), decimals(), index_cells(), Cell, dom_id -> (table, cell), for resolving a claim's anchor back to the source.…, The (table, cell) a claim points at, or None. §14.3: a claim whose anchor does… (+43 more)

### Community 7 - "test_api.py"
Cohesion: 0.05
Nodes (35): client(), created(), offline_app(), own_store(), asyncio, fixture, parametrize, API tests. Every run is driven from `fixtures/papers/`, so nothing here touches… (+27 more)

### Community 8 - "fetch.py"
Cohesion: 0.07
Nodes (39): cache_key(), _decode(), _download(), _extract_tar(), fetch_source(), is_safe_member_name(), load_cached(), _looks_like_tar() (+31 more)

### Community 9 - "models.py"
Cohesion: 0.10
Nodes (39): judge_all(), Judgement, One claim's verdict, and why if there isn't one. Carries no prose. Rendering…, check_table(), _finding(), _is_subject(), _observation(), observe() (+31 more)

### Community 10 - "FakeClient"
Cohesion: 0.15
Nodes (37): FakeClient, ok(), Test double. Routes are matched by exact URL first, then by regex., Convenience constructor for FakeClient routes., run_async(), check_url(), HEAD, then GET when HEAD is refused or claims the resource is gone. Confirming…, Route (+29 more)

### Community 11 - "marks.ts"
Cohesion: 0.10
Nodes (29): ReportView(), DocumentView, numericColumns(), PaperTable(), Row, toRows(), EASE_IN_OUT, HIGHLIGHT_MS (+21 more)

### Community 12 - "cn"
Cohesion: 0.10
Nodes (29): buildLanes(), GutterMarks(), Lane, InlineMark(), Mechanism(), Stage, STAGES, Output() (+21 more)

### Community 13 - "macros.py"
Cohesion: 0.12
Nodes (34): is_escaped(), mask_comments(), Small LaTeX lexical helpers shared by the ingest modules. Nothing here parses…, Read a control sequence at `index` (which must be `\\`). Returns…, True when the character at `index` is preceded by an odd number of backslashes., Blank out `%` comments, preserving length so offsets stay comparable. Character…, Drop comment text outright. Only for content we are about to normalise into…, Read a balanced `{...}` group starting at `index` (which must be `{`). Returns… (+26 more)

### Community 14 - "(site)/page.tsx"
Cohesion: 0.10
Nodes (22): Changelog(), ENTRIES, CAUGHT_BEFORE_SHIPPING, CELLS, CHECK_RUNS, CORPUS_FINDINGS, FALSE_FINDINGS, NOT_CHECKED_ENTRIES (+14 more)

### Community 15 - "HttpClient"
Cohesion: 0.09
Nodes (25): BreakingClient, CircuitBreaker, default_breaker(), _HostCircuit, Any, Circuit breaker over the HTTP adapter (§14.7). Crossref and OpenAlex are free,…, An `HttpClient` that stops asking a host that has stopped answering. A…, The process-wide breaker. Shared on purpose: each check builds its own client,… (+17 more)

### Community 16 - "orchestrator.py"
Cohesion: 0.13
Nodes (30): Artifact, CheckResult, str, A code repository found in the paper. Feeds the §5.2 confirmation screen, which…, One check's terminal result. Append-only — never mutated. Pending/running are…, Why something could not be checked. Surfaced verbatim in the §5.5 "not checked"…, ReasonCode, Table (+22 more)

### Community 17 - "ingest/__init__.py"
Cohesion: 0.10
Nodes (29): AssembledSource, Which source file a character offset in `text` came from. Segments nest — an…, FetchResult, What ingest got back from arXiv (or from the cache)., Ingest: arXiv id -> `SourceDocument`. from pv.ingest import ingest,…, macro_table(), Flatten to the `SourceDocument.macros` shape: name -> expansion body. Keys…, build() (+21 more)

### Community 18 - "test_checks_arith.py"
Cohesion: 0.10
Nodes (30): parsed_bert_glue(), parametrize, Verdict, Acceptance tests for the arithmetic checks (1 and 3). Every table here is hand-…, The five-false-positives case. Four rows match; BiLSTM is within tolerance., `all` labels a grouping far more often than an aggregate, and `overall` only…, 81.9 is not the mean of 80/82/81, but a weighted average would give it. We…, Declining to assert is not declining to inform. The verdict stays unverifiable;… (+22 more)

### Community 19 - "parse_tables"
Cohesion: 0.06
Nodes (31): parse_document(), Table, Parse every tabular in an assembled `SourceDocument` from ingest. Prefers…, _float_spans(), parse_tables(), Spans of every float environment, innermost-last., Parse every tabular in an assembled LaTeX document. `latex` is…, _table_dom_id() (+23 more)

### Community 20 - "nav-rail.tsx"
Cohesion: 0.17
Nodes (9): instrumentSans, metadata, plexMono, sourceSerif, ITEMS, Tooltip(), TooltipContent(), TooltipProvider() (+1 more)

### Community 21 - "run-view.tsx"
Cohesion: 0.13
Nodes (22): CheckRow(), DocumentPane(), RunRail(), RunView(), SiteReport, HeroRunLoop(), Playing(), toRunReport() (+14 more)

### Community 22 - "HttpResponse"
Cohesion: 0.13
Nodes (13): _backoff(), HttpResponse, _is_texty(), Any, Path, True when we learned nothing. Callers must return unverifiable., Keyed by method + resolved URL. Re-runs during development cost nothing, which…, One completed *or failed* request. `status is None` means the exchange never… (+5 more)

### Community 23 - "CheckContext"
Cohesion: 0.12
Nodes (27): CheckContext, Everything a checker is allowed to see. If a checker needs something not on…, document(), fixture, parametrize, Claim mining (§14.3) and the claim-driven checkers. `Claim` had zero call…, §14.3. Safe only because a claim we cannot locate cannot be checked — it can…, The silence stops at the claim that could not be located. A checker handed one… (+19 more)

### Community 24 - "http.py"
Cohesion: 0.09
Nodes (23): AsyncClient, _as_error(), _classify(), _env_float(), _env_int(), ErrorKind, _finalize(), get_http_client() (+15 more)

### Community 25 - "tabular.py"
Cohesion: 0.11
Nodes (28): count_columns(), Return (n_columns, warnings)., Split on top-level `\\\\` only — never inside braces, math, or a nested…, Read a balanced `[...]` optional argument starting at `i`., read_bracket(), split_rows(), _build_table(), cell_anchor() (+20 more)

### Community 26 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 27 - "RunState"
Cohesion: 0.10
Nodes (18): NotChecked, collect_not_checked(), _fail(), _is_partial(), load_miner(), ReasonCode, Table, One run, in full, at rest. Serialisable by construction: every field is a… (+10 more)

### Community 28 - "ingest_directory"
Cohesion: 0.10
Nodes (26): load_document(), ReasonCode, Ingest, off the event loop. Returns (document, reason, detail); the reason is…, main(), Path, Readable summary of what ingest produced. python -m pv.ingest.cli 1706.03762…, summarize(), default_cache_dir() (+18 more)

### Community 29 - "test_links.py"
Cohesion: 0.11
Nodes (24): titles_match(), extract_urls(), _is_http(), `\\url{...}`, `\\href{...}{...}`, and bare http(s) URLs, in document order., _crossref_work(), fixture, Offline tests for the network checks. Nothing here touches the network: every…, test_commented_out_urls_are_not_extracted() (+16 more)

### Community 30 - "run.py"
Cohesion: 0.11
Nodes (24): _force_utf8_stdout(), main(), RunReport, Headless report to stdout. Build-order step 1 (brief §11). python -m pv.cli…, Windows consoles default to cp1252, which cannot encode the verdict glyphs.…, One line per paper, for the corpus run., render(), summarise() (+16 more)

### Community 31 - "Orchestrator"
Cohesion: 0.13
Nodes (19): _flag(), API configuration. One place reads the environment; nothing else branches on…, The on-disk source tree for this paper, if we have one. This is how the ten-…, Settings, HTTP surface over the checker. uvicorn pv.api.app:app --reload `app.py` holds…, execute(), _now(), datetime (+11 more)

### Community 32 - "read_group"
Cohesion: 0.16
Nodes (23): detect(), _has_content(), Bold detection. Bold appears in at least five forms across the corpus:…, Find a bold construct with non-empty scope in already-expanded LaTeX., Text from `i` until the enclosing group closes (or the string ends)., Return (is_bold, bold_source). `bold_source` is one of `textbf`, `mathbf`,…, _rest_of_group(), _scan() (+15 more)

### Community 33 - "FileStateStore"
Cohesion: 0.14
Nodes (11): FileStateStore, Path, RunReport, One JSON document per run under `PV_STATE_DIR`. This is what makes "resumable…, Execute the next stage, persist, emit events. Idempotent and resumable. Exactly…, Advance to a terminal stage. The synchronous driver's whole body. Blocks in…, Record the §5.2 choice. `None` is "continue without code" — a normal answer,…, The contract type, whatever stage the run is at. Mid-run this is a partial… (+3 more)

### Community 34 - "assemble"
Cohesion: 0.12
Nodes (21): assemble(), find_main_file(), normalize_name(), Resolve a multi-file LaTeX source tree into one string. The fixture paper is…, Map an `\\input` argument onto a key of `files`., Flatten `files` (relative name -> content) into one LaTeX string. `\\input`,…, A run of the assembled string that came from one file., Files named by a `%!TEX root=...` magic comment. Several papers in the corpus… (+13 more)

### Community 35 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 36 - "table"
Cohesion: 0.19
Nodes (22): cell(), column(), An empty cell must not become the minimum of a lower-is-better column., BERT bolds `{\\bf 86.7/85.9}`. A pair has no single value to be the best, so…, The bold is a single value, but a peer is a pair. Comparing against the single-…, A cell as agent B emits it, including the `values` / `value` invariant: one…, An average sits after the values it averages. `Overall` with data columns to…, table() (+14 more)

### Community 37 - "reports.ts"
Cohesion: 0.19
Nodes (14): SubmitPage(), generateStaticParams(), ReportPage(), stripLatex(), generateStaticParams(), RunPage(), SubmitForm(), parseArxivId() (+6 more)

### Community 38 - "_claim"
Cohesion: 0.15
Nodes (19): applies(), _claim(), claims_for(), _classify(), _findings(), link_claims(), _observation(), observe() (+11 more)

### Community 39 - "parse/latexutil.py"
Cohesion: 0.16
Nodes (17): collect_column_types(), Column-spec parsing. Getting the column count wrong shifts every column index,…, letter -> number of `{...}` arguments, from `\\newcolumntype` definitions., Table parsing: LaTeX source in, `list[Table]` out. The one function checks…, _arity(), blank_comments(), collect_macro_defs(), collect_macros() (+9 more)

### Community 40 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, json-schema-to-typescript, tailwindcss, @tailwindcss/postcss (+11 more)

### Community 41 - "context"
Cohesion: 0.12
Nodes (19): Declining to assert is not declining to inform. Deliberate, and documented in…, test_an_unverifiable_average_still_attaches_the_comparison(), test_every_check_result_carries_the_policy_that_judged_it(), context(), With block scoping removed the same table reports two bolds in one column. This…, The regression, from the fixture: six false divergences, now none., `repos` proposes repositories and exposes no `run`. Asking for it by name is a…, The EN-FR column of `tab:wmt-results`, in source order with its blocks. Two… (+11 more)

### Community 42 - "iter_atoms"
Cohesion: 0.12
Nodes (17): Atom, iter_atoms(), Walk `s`, yielding the atoms a table parser needs to split on, each tagged with…, Split a row on top-level `&`. `\\&` is a control symbol, not a separator., split_cells(), extract(), find_values(), _is_name_suffix() (+9 more)

### Community 43 - "app.py"
Cohesion: 0.17
Nodes (17): get_report(), get_run(), health(), list_runs(), RunReport, The HTTP surface. Build-order step 2 (brief §11). uvicorn pv.api.app:app…, Recently checked papers (§5.1), most recent first., The run as it stands. Mid-run this is a partial report: the checks that have… (+9 more)

### Community 44 - "registry.py"
Cohesion: 0.18
Nodes (14): discover(), _is_check_module(), _missing(), MissingChecker, CheckResult, Discovery and execution of checks. Every check module exposes: CHECKER_NAME:…, Resolve check names to modules, one entry per name, in the order given. A name…, Run one check, converting any failure into an `unverifiable` result. (+6 more)

### Community 45 - "Run"
Cohesion: 0.15
Nodes (17): confirm_artifact(), create_run(), Answer the §5.2 repository question and release the run. `artifact: null` means…, Start a run and return its id immediately. `arxiv_id` may be a bare id, a…, manifest_checks(), The checks this run intends to execute, known before any of them runs.…, CheckDescriptor, ConfirmArtifactRequest (+9 more)

### Community 46 - "store.py"
Cohesion: 0.18
Nodes (13): Enum, str, API-level envelopes around the contract. Every payload the frontend receives is…, `event: state`. The run is paused for a decision it cannot make itself., Run-level lifecycle, coarse. Derived, never stored on a check. `complete` means…, RunStatus, StateEvent, StreamEvent (+5 more)

### Community 47 - "find_repository_candidates"
Cohesion: 0.16
Nodes (15): find_repository_candidates(), find_repository_mentions(), _in_abstract(), parse_repo_url(), Offline: every GitHub/GitLab repository the source points at, with its signals., Offline: §5.2 candidates, best first, without any metadata lookup., Heuristic and deterministic. Ranking only — it never decides anything., Internal: one repository and every place the paper points at it. The ranking… (+7 more)

### Community 48 - "dependencies"
Cohesion: 0.12
Nodes (17): @base-ui/react, class-variance-authority, dependencies, @base-ui/react, class-variance-authority, lucide-react, motion, next (+9 more)

### Community 49 - "mine"
Cohesion: 0.18
Nodes (15): Claim mining — every checkable assertion in a paper, as data (§14.3). Until…, mine(), mine_body_numbers(), mine_citations(), mine_links(), Table, Every checkable assertion in the paper, deterministically. Deterministic…, One claim per non-header cell that states a value, in table then cell order. A… (+7 more)

### Community 50 - ".finish"
Cohesion: 0.17
Nodes (8): DoneEvent, `event: done`. Terminal. Carries the complete report, including the run-level…, RunReport, Record the run-level fields the individual checks cannot know, and close every…, A live queue plus everything that has already happened. Returned together and…, The contract type, whatever stage the run is at. Mid-run this is a partial…, Event, Queue

### Community 51 - "RunRecord"
Cohesion: 0.20
Nodes (8): One row of §5.1's recently checked papers., RunManifest, RunSummary, Record the answer. The orchestrator releases the run; this is the view of it…, Most-recent-first, bounded. Process-local: restarting the server loses history,…, One run. The `checks` list only ever grows., RunRecord, RunStore

### Community 52 - "repos.py"
Cohesion: 0.21
Nodes (13): Bridge for the checker interface, which is synchronous (`run(ctx)`). If a loop…, run_sync(), _bibliography_start(), fetch_metadata(), find_repositories(), find_repositories_sync(), _github_headers(), _parse_time() (+5 more)

### Community 53 - "_run_check"
Cohesion: 0.16
Nodes (10): _now(), CheckResult, datetime, How long a driver may sleep before asking again. 0 when there is nothing to…, Register a run in `queued`. Does no work — `advance` does the work. `run_id` is…, §5.2's confirmation screen, and the state it needs to live in. The run never…, One check, with a wall-clock budget (§14.7). `registry.run_check` already…, §5.2 candidates, deterministically and without a request. Metadata (stars, last… (+2 more)

### Community 54 - "bert_glue"
Cohesion: 0.14
Nodes (14): End to end through the refactor: four rows match, BiLSTM is within tolerance,…, BERT's GLUE table bolds only its `Average` header, so check 1 judged nothing…, test_a_check_that_evaluated_no_claim_carries_no_fingerprint(), test_the_whole_bert_table_still_comes_out_as_ground_truth_says(), bert_glue(), `tab:glue_official`, including its second header row of dataset sizes.…, What agent B emits today: a hole in the row plus a parse warning. Averaging the…, test_bert_bilstm_tolerance_finding_carries_the_numbers() (+6 more)

### Community 55 - "links.py"
Cohesion: 0.22
Nodes (12): clean_url(), describe_location(), _footnote_at(), _in_environment(), mask_comments(), _match_brace(), Check 2 — dead links. The only thing this check is allowed to conclude is what…, Index just past the `}` matching the `{` at `open_index`, or -1. (+4 more)

### Community 56 - "extract_macros"
Cohesion: 0.23
Nodes (13): expand(), extract_macros(), Expand every known macro in `text`, repeatedly, until it stops changing.…, Collect every macro definition in `latex`, keyed by name (no backslash). Later…, The reason macro expansion exists: a regex for \\textbf misses this., test_def_form_is_supported(), test_expansion_does_not_loop_forever(), test_expansion_handles_an_optional_argument() (+5 more)

### Community 57 - "HostRateLimiter"
Cohesion: 0.21
Nodes (6): HostRateLimiter, One in-flight request per host at a time, with a minimum gap between them. The…, _Slot, Lock, test_rate_limiter_spaces_requests_to_one_host(), test_rate_limiter_uses_the_arxiv_floor_and_inherits_subdomains()

### Community 58 - "result_fingerprint"
Cohesion: 0.17
Nodes (12): The identity of one checker's result over a set of claims. §14.5 fingerprints a…, result_fingerprint(), datetime, Finding, ReasonCode, Verdict, _result(), This is how a backfill is scoped: select the old version, enqueue only those. (+4 more)

### Community 59 - "table_claims"
Cohesion: 0.26
Nodes (10): cell_anchor(), column_header(), Anchor, Table, The cell vocabulary shared by claim mining and by the table checks.…, Anchor for one table cell, following the dom_id convention in models.py., One `body_number` claim per non-header cell that states a value. Cell order,…, table_claims() (+2 more)

### Community 60 - "corpus.server.ts"
Cohesion: 0.33
Nodes (9): checkFrom(), elapsed(), findingFrom(), realReports(), reportById(), Cell(), FeatureBento(), Hero() (+1 more)

### Community 61 - "fetch_corpus.py"
Cohesion: 0.22
Nodes (8): fetch(), main(), Fetch the validation corpus (brief §11: verify against 10 papers by hand).…, framework, root, rewrites, services, frontend

### Community 62 - "claim_content_hash"
Cohesion: 0.28
Nodes (8): claim_content_hash(), _digest(), fingerprint(), Content addressing for claims and check results (§14.1, §14.5). Orchestrator-…, The identity of a claim, independent of when or how it was checked. `value` is…, The identity of a judgement. Stored on every CheckResult. Re-running a paper…, 41.8 and 41.80 are the same number. A parser reporting more digits must not…, test_trailing_zeros_do_not_change_a_claims_identity()

### Community 63 - "(site)/layout.tsx"
Cohesion: 0.28
Nodes (5): metadata, COLUMNS, SiteFooter(), NAV, SiteHeader()

### Community 64 - "load_directory"
Cohesion: 0.25
Nodes (8): load_directory(), Load an already-extracted source tree from disk. No network, ever. Used for the…, The DenseNet tarball ships `office-31.tex` and `svn-mnist.tex`, leftovers that…, Anything not reachable from the main file is not part of the document., test_densenet_excludes_stale_files_from_another_paper(), test_empty_directory_reports_no_latex_source(), test_load_directory_never_reaches_the_network(), test_unreachable_files_are_excluded_across_the_corpus()

### Community 65 - "StateStore"
Cohesion: 0.29
Nodes (4): default_state_store(), `PV_STATE_DIR` selects the durable store. Unset, runs live in memory., StateStore, Protocol

### Community 66 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, fixtures:sync, lint, prebuild, start, types:generate

### Community 67 - "ExtractedUrl"
Cohesion: 0.29
Nodes (6): check_urls(), ExtractedUrl, Anchor, One request set per distinct URL, however many times it appears., One URL as it appears in the source, with where it appeared., _near_availability_phrase()

### Community 68 - "_result"
Cohesion: 0.29
Nodes (7): CheckResult, datetime, ReasonCode, Verdict, Synchronous entry point discovered by the registry., _result(), run()

### Community 69 - "direction.py"
Cohesion: 0.38
Nodes (6): _match(), Direction, Metric name and optimisation direction, from the column header only. Order of…, Return (metric, direction, direction_source). `raw_header` is the header with…, resolve(), _tokens()

### Community 70 - "resnet_top1"
Cohesion: 0.33
Nodes (6): Direction, ResNet's top-1 error table: 25.03, the minimum, is bolded., Ground truth case 3. The headers are `plain` and `ResNet` — no metric name, no…, resnet_top1(), test_lower_is_better_bolded_minimum_matches(), test_unknown_direction_is_unverifiable_even_when_the_bold_is_right()

### Community 71 - "CheckEvent"
Cohesion: 0.40
Nodes (4): CheckEvent, `event: check`. One per completed check, in manifest order., CheckResult, Append one terminal result and tell every subscriber. Never updates.

### Community 72 - "sync-fixtures.mjs"
Cohesion: 0.40
Nodes (4): DEST, files, here, SOURCE

### Community 73 - "elmo_alternate_weights"
Cohesion: 0.40
Nodes (5): elmo_alternate_weights(), `table:alternate_weights`. "All layers" is a `\\multicolumn` heading two lambda…, Even spelled `Average`, a sub-column of a group is one alternative being…, test_elmo_all_layers_is_not_an_average(), test_sub_columns_of_a_multicolumn_group_are_never_averages()

### Community 74 - "paper_repositories"
Cohesion: 0.50
Nodes (4): paper_repositories(), §5.2 candidates, best first, with `confidence` for preselection. This proposes;…, normalize_id(), (arxiv_id, version, error). Accepts a bare id, a versioned id, or an arXiv URL.…

### Community 75 - "_discover_positions"
Cohesion: 0.50
Nodes (4): _discover_positions(), Offsets of every `\\begin{tabular...}` by direct scan., Offsets of every `\\begin{tabular...}` in `src`, plus any warning about how…, _scan_positions()

### Community 76 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 77 - "generate-types.mjs"
Cohesion: 0.50
Nodes (3): here, outPath, schemaPath

### Community 90 - "verdict-pane.tsx"
Cohesion: 0.15
Nodes (11): ComparisonBlock(), NotCheckedList(), typesetNumber(), VerdictPane(), ComparisonBlock(), FindingDetail(), typesetNumber(), VerdictChip() (+3 more)

## Knowledge Gaps
- **176 isolated node(s):** `paper-verify`, `$schema`, `style`, `rsc`, `tsx` (+171 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SourceDocument` connect `test_ingest.py` to `test_orchestrator.py`, `models.py`, `FakeClient`, `orchestrator.py`, `ingest/__init__.py`, `parse_tables`, `CheckContext`, `RunState`, `ingest_directory`, `test_links.py`, `Orchestrator`, `FileStateStore`, `parse/latexutil.py`, `context`, `find_repository_candidates`, `mine`, `repos.py`, `_run_check`, `table_claims`, `StateStore`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `CheckContext` connect `CheckContext` to `FileStateStore`, `StateStore`, `_result`, `citations.py`, `row_arithmetic.py`, `_claim`, `models.py`, `FakeClient`, `context`, `registry.py`, `orchestrator.py`, `_run_check`, `links.py`, `http.py`, `RunState`, `test_links.py`, `Orchestrator`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `ReasonCode` connect `orchestrator.py` to `FileStateStore`, `StateStore`, `test_adjudicate.py`, `citations.py`, `row_arithmetic.py`, `fetch.py`, `models.py`, `registry.py`, `ingest/__init__.py`, `links.py`, `RunState`, `test_links.py`, `Orchestrator`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `SourceDocument` (e.g. with `IngestResult` and `FileStateStore`) actually correct?**
  _`SourceDocument` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `CheckContext` (e.g. with `FileStateStore` and `MemoryStateStore`) actually correct?**
  _`CheckContext` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `Orchestrator` (e.g. with `Artifact` and `CheckContext`) actually correct?**
  _`Orchestrator` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `Claim` (e.g. with `FileStateStore` and `MemoryStateStore`) actually correct?**
  _`Claim` has 9 INFERRED edges - model-reasoned connections that need verification._