# Suppressions

Findings this system made and then withdrew. Each file is one negative fixture.

An empty directory is the expected state. It means we have not yet published a
finding we had to take back.

## What lands here

The review gate (§14.8, `backend/pv/review.py`) holds every finding with
`verdict: diverges` and `severity: high` out of a public permalink until a person
releases it. When a reviewer suppresses one instead — because the finding is
wrong — `POST /runs/{id}/review/{fingerprint}/suppress` writes a file here.

The reason is required. A suppression with no reason is an untraceable deletion,
and the reasons are not free text: they are `SuppressionReason` in `review.py`,
and each one names a class of defect this codebase has actually produced.

## Why a file and not a database row

A suppression that only hides a finding fixes one URL. The same misreading comes
back the next time anyone touches the checker, and the six false positives caught
here before shipping were all the same shape — a lossy reading that produced a
confident accusation (`CLAUDE.md`). A file in `fixtures/` is a regression test:
`tests/test_review.py` reads every one of them and asserts it is still a usable
record, and a fingerprint recorded here is a judgement that must not be produced
again at the checker version that produced it.

Sibling of `fixtures/reports/`, which holds what the system does say. This holds
what it must never say again.

## The shape of a file

```json
{
  "arxiv_id": "0000.00000",
  "finding_fingerprint": "<64 hex>",
  "checker": "bold_extreme",
  "checker_version": "1",
  "policy_version": "1",
  "locator": "Table 3, row 2, column \"Ours\"",
  "claimed": "87.4",
  "computed": "84.1",
  "reason": "comparison_set_wrong",
  "reason_label": "We compared against the wrong set of values",
  "note": "The block boundary is a \\specialrule the parser did not read.",
  "suppressed_at": "2026-08-01T12:00:00+00:00",
  "suppressed_by": ""
}
```

The finding's `explanation` is deliberately absent. It is our prose about a
finding we have just agreed was wrong, and a fixture is not the place to keep a
sentence we do not stand behind. What must not recur is the comparison, and that
is what is stored.

Suppressing does not delete anything. The run's record of what it found is
unchanged and stays readable at `GET /runs/{id}/report`; what changes is that it
is never published.
