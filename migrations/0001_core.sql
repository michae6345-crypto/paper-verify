-- 0001_core.sql — the §10 tables, RLS, and pgvector.
--
-- Forward-only. This file is applied once and never edited; a mistake here is
-- corrected by 0002, 0003, ... Numbered, plain SQL, no ORM: the models are
-- Pydantic and `backend/pv/models.py` is the contract. An ORM would be a second,
-- divergent declaration of the same shapes.
--
-- Two rules run through every table below.
--
--   Append-only. A check result is never updated, only superseded by a row with
--   a later `checker_version`. Readers take the highest version per
--   (claim_id, checker). This is enforced by a trigger, not by convention —
--   a verdict published about a named researcher has to be defensible a year
--   later, and that is only true if the row that produced it still exists
--   exactly as written.
--
--   Default deny. RLS is enabled on every table in the same migration that
--   creates it, not in a follow-up. The project's anon key is public by design,
--   so a table without RLS is readable by anyone the moment the Data API is
--   enabled. See the RLS section at the foot of this file for what each table
--   would leak and why it has no policy.

SET search_path TO public, extensions;

-- pgvector, for `claims.embedding`. `extensions` is where Supabase installs it;
-- a schema in search_path that does not exist (local pgvector/pgvector:pg16) is
-- ignored, so the same statement works in both places.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()


-- --------------------------------------------------------------------------
-- Append-only enforcement
-- --------------------------------------------------------------------------

-- Raises on UPDATE and DELETE. Attached below to every table that records what
-- the system found or what someone said to us. A superseding row is an INSERT.
--
-- Deliberately not a permissions grant: the API connects as the table owner, and
-- an owner can always re-grant itself UPDATE. A trigger is the only form of this
-- rule that survives someone reaching for psql at 2am.
CREATE OR REPLACE FUNCTION pv_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'table % is append-only; supersede with a new row rather than % it',
        TG_TABLE_NAME, lower(TG_OP)
        USING ERRCODE = 'restrict_violation';
END;
$$;


-- --------------------------------------------------------------------------
-- papers
-- --------------------------------------------------------------------------

CREATE TABLE papers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    arxiv_id     text NOT NULL,
    -- arXiv v1 and v2 of one paper are different documents that can disagree,
    -- and the whole product is about whether a document agrees with itself.
    -- They are separate rows.
    version      text,
    title        text NOT NULL DEFAULT '',
    venue        text NOT NULL DEFAULT '',
    source_hash  text NOT NULL DEFAULT '',
    fetched_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX papers_arxiv_version_key
    ON papers (arxiv_id, coalesce(version, ''));


-- --------------------------------------------------------------------------
-- tables
-- --------------------------------------------------------------------------

-- Cells as jsonb rather than a `cells` table. A cell is only ever read as part
-- of its table — no query asks "every cell with value 41.8 across the corpus" —
-- and the jsonb is a `list[Cell]` round-tripped through the contract, so the
-- stored form cannot drift from `models.Cell` the way a hand-maintained column
-- list would.
CREATE TABLE tables (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id       uuid NOT NULL REFERENCES papers (id) ON DELETE CASCADE,
    label          text,
    caption        text NOT NULL DEFAULT '',
    anchor         jsonb NOT NULL,
    columns        jsonb NOT NULL DEFAULT '[]'::jsonb,
    cells          jsonb NOT NULL DEFAULT '[]'::jsonb,
    latex_source   text NOT NULL DEFAULT '',
    n_rows         integer NOT NULL DEFAULT 0,
    n_cols         integer NOT NULL DEFAULT 0,
    header_source  text NOT NULL DEFAULT 'none',
    -- A tabular nested inside another table's cell. Authors use these to stack
    -- two lines of text; they carry no findings, and counting them makes
    -- `tables_parsed` overstate the paper. Stored, so the count can exclude them
    -- without losing the parse.
    is_nested      boolean NOT NULL DEFAULT false,
    parse_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tables_paper_idx ON tables (paper_id);


-- --------------------------------------------------------------------------
-- claims
-- --------------------------------------------------------------------------

CREATE TABLE claims (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id      uuid NOT NULL REFERENCES papers (id) ON DELETE CASCADE,
    -- Claim.content_hash. The identity of the claim itself, independent of when
    -- or how it was checked (§14.1). `checks.claim_id` carries this value.
    content_hash  text NOT NULL,
    kind          text NOT NULL,
    locator       text NOT NULL DEFAULT '',
    verbatim      text NOT NULL DEFAULT '',
    anchor        jsonb NOT NULL,
    value         double precision,
    normalized    jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- EMBEDDING_DIM in models.py. Nullable and unpopulated: check 7 is the first
    -- thing that needs it, and `sentence-transformers` drags in ~2GB of torch.
    -- The column exists so this migration does not have to be rewritten then.
    embedding     vector(384),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX claims_paper_hash_key ON claims (paper_id, content_hash);
CREATE INDEX claims_content_hash_idx ON claims (content_hash);

-- No ANN index. An IVFFlat index built on an empty table produces bad recall
-- forever, and HNSW on zero rows is wasted pages. Build it in a later migration
-- when there are embeddings to build it from.


-- --------------------------------------------------------------------------
-- artifacts
-- --------------------------------------------------------------------------

CREATE TABLE artifacts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id     uuid NOT NULL REFERENCES papers (id) ON DELETE CASCADE,
    kind         text NOT NULL DEFAULT 'github',
    url          text NOT NULL,
    path         text NOT NULL DEFAULT '',
    commit_sha   text,
    stars        integer,
    last_commit  timestamptz,
    archived     boolean,
    found_at     text NOT NULL DEFAULT '',
    anchor       jsonb,
    confidence   double precision NOT NULL DEFAULT 0,
    -- GitHub 403 without a token. The candidate is retained and the UI shows no
    -- stars; it is not an error state and must not read as one.
    lookup_error text,
    status       text NOT NULL DEFAULT 'candidate'
                 CHECK (status IN ('candidate', 'confirmed')),
    resolved_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artifacts_paper_idx ON artifacts (paper_id);
CREATE UNIQUE INDEX artifacts_paper_url_key ON artifacts (paper_id, url);


-- --------------------------------------------------------------------------
-- runs
-- --------------------------------------------------------------------------

CREATE TABLE runs (
    -- The id the API already issues: uuid4().hex. Text, not uuid, because it is
    -- on the wire and in URLs in that form and round-tripping it through a uuid
    -- would reintroduce the dashes.
    run_id       text PRIMARY KEY,
    paper_id     uuid REFERENCES papers (id) ON DELETE SET NULL,
    artifact_id  uuid REFERENCES artifacts (id) ON DELETE SET NULL,
    arxiv_id     text NOT NULL,
    version      text,
    title        text NOT NULL DEFAULT '',
    -- The coarse status the run list renders. `failed` and `partial` are §14.2
    -- stages, not statuses: both produced a report, and a run does not fail — a
    -- paper we could not check is a report saying so.
    status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'running', 'complete')),
    stage        text NOT NULL DEFAULT 'queued',
    manifest     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The §5.2 candidate list and the confirmed repository, as the run saw them.
    -- Kept here as well as in `artifacts` on purpose: `artifacts` is the paper's
    -- current record of a repository, and stars and last-commit change after the
    -- run. This is the evidence at the moment the verdict was reached, which is
    -- what has to be reconstructible a year later.
    artifact_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
    artifact     jsonb,
    artifact_deadline   timestamptz,
    tables_parsed integer NOT NULL DEFAULT 0,
    started_at   timestamptz,
    finished_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX runs_created_idx ON runs (created_at DESC);
CREATE INDEX runs_arxiv_idx ON runs (arxiv_id);

-- `runs` is the one mutable table here, and only in its lifecycle columns: a run
-- moves queued -> running -> complete, and that is a state machine, not a
-- judgement. Nothing it records about a paper is ever rewritten; the findings
-- live in `checks` and `findings`, which are append-only.


-- --------------------------------------------------------------------------
-- checks
-- --------------------------------------------------------------------------

CREATE TABLE checks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          text NOT NULL REFERENCES runs (run_id) ON DELETE CASCADE,
    -- Position within the run. This is `CheckEvent.index` on the wire, and it is
    -- what makes an SSE replay reproduce the order a live subscriber saw.
    idx             integer NOT NULL,
    -- Claim.content_hash. Deliberately not a foreign key: a check can be
    -- produced for something that is not a mined claim (a whole table, a
    -- bibliography), and the empty string is a normal value. A constraint here
    -- would push those into inventing a claim row to satisfy it.
    claim_id        text NOT NULL DEFAULT '',
    checker         text NOT NULL,
    checker_version text NOT NULL,
    policy_version  text NOT NULL DEFAULT '',
    -- §14.5. sha256 over (claim_id, checker, checker_version, policy_version,
    -- artifact_commit). The backfill selects on this and re-running executes
    -- only the misses; the whole idempotency story rests on it being indexed.
    fingerprint     text NOT NULL DEFAULT '',
    verdict         text NOT NULL CHECK (verdict IN (
                        'matches', 'within_tolerance', 'diverges',
                        'unverifiable', 'not_attempted')),
    -- ReasonCode. Plain text with no CHECK: reason codes are added as we learn
    -- what we cannot check, and a new one must never require a migration before
    -- an honest `unverifiable` can be written. The verdict vocabulary above is
    -- the opposite case — §7 fixes it at five values and it must not grow by
    -- accident.
    reason          text,
    provenance      text NOT NULL DEFAULT 'extracted'
                    CHECK (provenance IN ('extracted', 'inferred')),
    display_name    text NOT NULL DEFAULT '',
    description     text NOT NULL DEFAULT '',
    duration_ms     integer,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX checks_run_idx_key ON checks (run_id, idx);
-- The backfill index: "every check produced by version X of this checker".
CREATE INDEX checks_fingerprint_idx ON checks (fingerprint);
-- Readers take the highest version per (claim_id, checker).
CREATE INDEX checks_claim_checker_idx ON checks (claim_id, checker, checker_version DESC);

CREATE TRIGGER checks_append_only
    BEFORE UPDATE OR DELETE ON checks
    FOR EACH ROW EXECUTE FUNCTION pv_append_only();


-- --------------------------------------------------------------------------
-- findings
-- --------------------------------------------------------------------------

CREATE TABLE findings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id    uuid NOT NULL REFERENCES checks (id) ON DELETE CASCADE,
    -- Position within the check, so document order survives a round trip. The
    -- siglum is assigned from it by the runner and is not an identity.
    ordinal     integer NOT NULL,
    severity    text NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('high', 'medium', 'low')),
    siglum      text NOT NULL DEFAULT '',
    claimed     text,
    computed    text,
    delta       text,
    anchor      jsonb NOT NULL,
    verbatim    text NOT NULL DEFAULT '',
    explanation text NOT NULL DEFAULT '',
    -- `pv.amendments.identity.finding_fingerprint`. Derived, not authoritative:
    -- it is computed from the row and stored so the review gate and the
    -- amendment log can join on it without rebuilding every report.
    fingerprint text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX findings_check_ordinal_key ON findings (check_id, ordinal);
CREATE INDEX findings_fingerprint_idx ON findings (fingerprint);

CREATE TRIGGER findings_append_only
    BEFORE UPDATE OR DELETE ON findings
    FOR EACH ROW EXECUTE FUNCTION pv_append_only();


-- --------------------------------------------------------------------------
-- not_checked
-- --------------------------------------------------------------------------

-- §5.5. First-class, not an error log: a run where half the checks are
-- unverifiable with clear reasons is a success. This table is the product.
CREATE TABLE not_checked (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      text NOT NULL REFERENCES runs (run_id) ON DELETE CASCADE,
    ordinal     integer NOT NULL,
    what        text NOT NULL,
    reason_code text NOT NULL,
    detail      text NOT NULL DEFAULT '',
    siglum      text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX not_checked_run_ordinal_key ON not_checked (run_id, ordinal);
CREATE INDEX not_checked_reason_idx ON not_checked (reason_code);

CREATE TRIGGER not_checked_append_only
    BEFORE UPDATE OR DELETE ON not_checked
    FOR EACH ROW EXECUTE FUNCTION pv_append_only();


-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------
--
-- Default deny on every table, with no policy for `anon` or `authenticated`.
--
-- The reasoning, once, because it is the same for all eight: the API reads and
-- writes these tables over the direct Postgres connection as their owner, which
-- is not subject to RLS. Nothing else is meant to reach them. Supabase exposes
-- `anon` through PostgREST using a key that ships in the browser, so any policy
-- granting `anon` a SELECT is a public endpoint whether or not we ever call it.
--
-- Per table, what a missing default-deny would leak:
--
--   findings, checks   A finding with verdict `diverges` and severity `high` is
--                      the strongest thing this system says about a named
--                      researcher, and §14.8 holds it out of the public
--                      permalink until a person has read it. That gate lives in
--                      `review.py`, above the database. A SELECT policy on these
--                      tables routes around it entirely: the held finding is a
--                      row, and the row would be readable. This is the single
--                      most important line in the file.
--   runs, not_checked  Reveal which papers were examined and what we could not
--                      check. Harmless in isolation, but joined to `checks` they
--                      reconstruct an unreleased report.
--   papers, tables,
--   claims, artifacts  A cache of other people's LaTeX and repository metadata.
--                      No reason to publish it, and `claims.embedding` is
--                      derived work we have no licence to redistribute.
--
-- A public permalink is served by our API, which applies §14.8's redaction
-- before anything reaches a response. That is the only path to a public number,
-- and it must stay the only one. When a read-only Data API path is genuinely
-- wanted, add it as a policy against a *view* that has redaction built into its
-- WHERE clause — never against these tables.

ALTER TABLE papers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims      ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE not_checked ENABLE ROW LEVEL SECURITY;

-- Belt and braces. RLS alone is enough to stop a SELECT, but a role that holds
-- table privileges and no policy is one `CREATE POLICY ... FOR SELECT USING
-- (true)` away from a public report; a role that holds no privileges at all is
-- two steps away. The roles only exist on Supabase, so this is guarded — on a
-- local pgvector container it is a no-op rather than a failed migration.
DO $$
DECLARE
    r text;
    t text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            FOREACH t IN ARRAY ARRAY[
                'papers', 'tables', 'claims', 'artifacts',
                'runs', 'checks', 'findings', 'not_checked'
            ] LOOP
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
            END LOOP;
        END IF;
    END LOOP;
END;
$$;
