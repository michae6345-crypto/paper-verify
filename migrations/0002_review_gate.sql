-- 0002_review_gate.sql — amendments, and the decisions `review.py` holds in memory.
--
-- These are separated from 0001 not because they are less important but because
-- they are the two tables where the failure mode is a person's words rather than
-- a number: an author's contest of a finding, and a reviewer's decision about
-- what may be published on a page carrying a named researcher's name.
--
-- Both are append-only, and here that is stricter than it is for `checks`. A
-- check result is append-only so a verdict can be defended a year later. An
-- amendment is append-only because it is *someone else's words about us* —
-- rewriting a row to mark it resolved would let the operator of this system edit
-- an author's objection after the fact, and there is no version of that which is
-- defensible. A resolution is a new row. Both stay on the record.

SET search_path TO public, extensions;


-- --------------------------------------------------------------------------
-- amendments
-- --------------------------------------------------------------------------

CREATE TABLE amendments (
    -- Ordered identity as well as a key: `history()` returns the log oldest
    -- first, and two rows for one finding can arrive inside the same
    -- millisecond, so a timestamp is not a sufficient sort key.
    seq          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id       text NOT NULL REFERENCES runs (run_id) ON DELETE CASCADE,
    -- The judgement being contested — a §14.5 fingerprint, not a row id. A
    -- contest is against a specific reading of a paper under a specific policy;
    -- bump either version and this correctly stops resolving, because the
    -- objection was never made about the new judgement.
    finding_fingerprint text NOT NULL,
    -- The identity of the statement itself, from
    -- `pv.amendments.identity.amendment_fingerprint`. What the review gate holds.
    fingerprint  text NOT NULL,
    claim_id     text NOT NULL DEFAULT '',
    author_statement text NOT NULL DEFAULT '',
    corrected_value  text,
    status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'recheck_requested', 'resolved', 'withdrawn')),
    -- The result of re-running this claim, if it was rerun.
    recheck_result_fingerprint text,
    resolution_note text NOT NULL DEFAULT '',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX amendments_run_idx ON amendments (run_id, seq);
CREATE INDEX amendments_finding_idx ON amendments (run_id, finding_fingerprint, seq);
CREATE INDEX amendments_fingerprint_idx ON amendments (fingerprint);

CREATE TRIGGER amendments_append_only
    BEFORE UPDATE OR DELETE ON amendments
    FOR EACH ROW EXECUTE FUNCTION pv_append_only();


-- --------------------------------------------------------------------------
-- review_decisions
-- --------------------------------------------------------------------------
--
-- Only *decisions* are stored. What is waiting is derived from the report every
-- time it is asked for, so a finding cannot be held in a list that has fallen out
-- of step with what the run actually produced.
--
-- `held` is the default and is deliberately not representable as a row here. A
-- finding nobody has looked at is held, and that has to be true of a finding
-- whose review row was lost, not only of one whose row says so. Absence means
-- held. There is no state of this table under which an unreviewed high-severity
-- divergence becomes public.
CREATE TABLE review_decisions (
    seq         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id      text NOT NULL REFERENCES runs (run_id) ON DELETE CASCADE,
    arxiv_id    text NOT NULL DEFAULT '',
    -- `finding` is something we assert about a named researcher; `amendment` is
    -- something an unidentified sender asserts about us. Held means opposite
    -- things for the two, so the kind is part of the key: releasing a finding
    -- must never release the statement contesting it, or the reverse.
    kind        text NOT NULL CHECK (kind IN ('finding', 'amendment')),
    fingerprint text NOT NULL,
    -- No `held`: see above. A decision row is a decision.
    state       text NOT NULL CHECK (state IN ('released', 'suppressed')),
    -- A SuppressionReason or an AmendmentDeclineReason, depending on `kind`. Two
    -- vocabularies, one column, and they must not be conflated in reading:
    -- a suppression says we read a paper wrong; a decline says nothing about the
    -- paper at all. Required for `suppressed` — a suppression with no reason is
    -- an untraceable deletion, and an unexplained refusal to publish someone's
    -- words is exactly what this flow exists to make impossible.
    reason      text,
    note        text NOT NULL DEFAULT '',
    decided_by  text NOT NULL DEFAULT '',
    decided_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_suppression_needs_reason
        CHECK (state <> 'suppressed' OR reason IS NOT NULL)
);

-- The read: latest decision per (run, kind, fingerprint).
CREATE INDEX review_decisions_key_idx
    ON review_decisions (run_id, kind, fingerprint, seq DESC);

-- Append-only, like everything else: a reviewer who releases a finding and then
-- suppresses it leaves both rows, and "who released this, and when" stays
-- answerable. A decision that could be edited is not a record of review.
CREATE TRIGGER review_decisions_append_only
    BEFORE UPDATE OR DELETE ON review_decisions
    FOR EACH ROW EXECUTE FUNCTION pv_append_only();


-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------
--
-- Default deny, no policies, for the same reason as 0001 — and with the sharpest
-- consequences in the schema:
--
--   amendments        Unpublished words from someone we cannot identify, sitting
--                     against a named researcher's paper. A SELECT policy here
--                     publishes a statement no person has read, on someone
--                     else's page. There is no auth layer
--                     (`pv.amendments.submitter`), so anyone can write one.
--   review_decisions  The map of what is held. Readable, it tells anyone which
--                     findings exist but are being withheld — which discloses
--                     the accusation while withholding the evidence, the worst
--                     of both halves.
--
-- Reads of both go through the API, which applies §14.8 first.

ALTER TABLE amendments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_decisions  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    r text;
    t text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            FOREACH t IN ARRAY ARRAY['amendments', 'review_decisions'] LOOP
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
            END LOOP;
        END IF;
    END LOOP;
END;
$$;
