# Ground truth

Hand-derived by the orchestrator from the validation corpus, per brief §11 ("verify
against 10 papers by hand before writing any UI"). These are the answers the checkers
must produce. Where a checker disagrees with this file, the checker is wrong.

Every case below is a **false positive we must not produce**. A false accusation against
a named researcher's paper is the worst thing this product can do.

---

## Case 1 — Transformer, `tab:wmt-results` (1706.03762)

EN-FR column, in source order with block boundaries:

| block | value | bold |
| --- | --- | --- |
| 0 | 39.2, 39.92, 40.46, 40.56 | — |
| 1 | 40.4, 41.16, **41.29** | bold |
| 2 | 38.1, **41.8** | bold |

Blocks are separated by `\hline` and `\specialrule`. Direction: higher is better (BLEU).

**Expected: `matches`.** Each bold is the best *within its own block* — 41.29 is the best
ensemble, 41.8 the best overall. A whole-column comparison reports `diverges` on 41.29.
That is wrong.

Also in this table: `\boldmath$3.3\cdot10^{18}$` sits inside a `\multicolumn{2}`, so it
belongs to no single column → `unverifiable` / `CELL_SPANS_COLUMNS`. Its column is
training cost, where **lower is better**.

Separately, a genuine finding: the abstract and this table both state EN-FR BLEU `41.8`,
while the body of `results.tex` states `41.0`. Real internal inconsistency, and our
canonical end-to-end test for check 4.

---

## Case 2 — BERT, `tab:glue_official` (1810.04805) — the check 3 trap

The GLUE table's `Average` column. Computed both plausible ways:

| row | stated | mean of 9 | delta | mean of 8 | delta |
| --- | --- | --- | --- | --- | --- |
| Pre-OpenAI SOTA | 74.0 | 74.000 | +0.000 | 73.237 | +0.763 |
| BiLSTM+ELMo+Attn | 71.0 | 70.944 | +0.056 | 70.300 | +0.700 |
| OpenAI GPT | 75.1 | 75.133 | −0.033 | 74.350 | +0.750 |
| BERT-base | 79.6 | 79.600 | +0.000 | 79.125 | +0.475 |
| BERT-large | 82.1 | 82.078 | +0.022 | 81.600 | +0.500 |

The first data column is `MNLI-(m/mm)` and its cells hold **two numbers separated by a
slash**: `86.7/85.9`. The average is over **nine values**, counting m and mm separately —
not over the eight columns.

**Expected: `matches` on four rows, `within_tolerance` on BiLSTM+ELMo+Attn.**

A checker that reads `86.7/85.9` as a single cell and averages eight values reports
`diverges` on **all five rows** of a landmark paper, each by 0.5–0.76. This is the single
most dangerous false positive we have found. Rules that follow from it:

- A cell may contain more than one value. Model that explicitly; do not silently take the
  first number.
- When the denominator of an average is ambiguous, return `unverifiable`, never
  `diverges`. Only report a divergence when no plausible reading of the row reproduces
  the stated value.

BiLSTM+ELMo+Attn is also the tolerance test: 70.944 vs a stated 71.0 is 0.056 off, just
outside the ±0.05 rounding band from one-decimal display. That is `within_tolerance`,
not `diverges`.

---

## Case 3 — ResNet, top-1 error table (1512.03385)

```
            & plain & ResNet \\
18 layers   & 27.94 & 27.88  \\
34 layers   & 28.54 & \textbf{25.03} \\
```

The `ResNet` column bolds 25.03, the **minimum** — correct, because these are error
rates. A max comparison flags it.

But the column headers are `plain` and `ResNet`. There is no metric name, no `↑`/`↓`
arrow, and no "(lower is better)" anywhere in the header. The word "error" appears only
in the caption and surrounding prose.

**Expected: `unverifiable` / `METRIC_DIRECTION_UNKNOWN`** — unless direction can be
established from the caption deterministically. This is the correct and honest outcome,
not a gap. Guessing "max" here produces a false positive; guessing "min" happens to be
right and is still guessing.

---

## Case 4 — ELMo, `table:alternate_weights` (1802.05365) — the check 3 keyword trap

```
Task & Baseline & Last Only & \multicolumn{2}{c}{All layers} \\
     &          &           & $\lambda$=1 & $\lambda$=0.001 \\ \hline
SQuAD & 80.8 & 84.7 & 85.0 & \textbf{85.2} \\
SNLI  & 88.1 & 89.1 & 89.3 & \textbf{89.5} \\
SRL   & 81.6 & 84.1 & 84.6 & \textbf{84.8} \\
```

**Expected: `not_attempted` — this table has no average column.**

"All layers" means *using all layers of the biLM*, contrasted with "Last Only". The
orchestrator's original spec listed `all` as an average-column keyword, so the checker
treated both λ sub-columns as averages, took the mean of Baseline and Last Only
(80.8, 84.7 → 82.75), and emitted **six `diverges` findings** against the paper.

Rules that follow:

- `all` is never an average keyword on its own. It labels a grouping — "all layers",
  "all tasks", "all data" — far more often than an aggregate. Keep `avg`, `average`,
  `mean`; treat `overall` as weaker evidence.
- An average column is a single column. A candidate that is one of several sub-columns
  under a shared `\multicolumn` header is a grouping, not an aggregate.
- Averages of a row normally sit at the end of the row, after the values they average.

This is the third instance of the same defect shape and the first one introduced by an
instruction rather than by an implementation. The spec is as capable of producing a
false accusation as the code is.

## Structural hazards found in the corpus

Each of these appears in a real paper above and breaks a naive parser:

| Hazard | Where | Consequence if unhandled |
| --- | --- | --- |
| `tabular*` environment | BERT | Table missed entirely |
| `@{\extracolsep{\fill}}` in the column spec | BERT | Column count wrong |
| `{\bf X}` group-scoped bold | BERT | Every bold missed; check 1 finds nothing |
| Paired values in one cell (`86.7/85.9`) | BERT | Five false `diverges` — see case 2 |
| `\newcolumntype{x}[1]{...}` custom column types | ResNet | Column spec parse fails |
| Two-row headers (names, then dataset sizes) | BERT | Header treated as data |
| Macro row labels (`\bertbase`) | BERT | Row label unreadable |
| Spacer column with no data | Transformer | Column index ≠ cell index |
| `\boldmath` inside `\multicolumn` | Transformer | Bold attributed to wrong column |
| Metric direction absent from the header | ResNet | Direction must degrade to unknown |

## Corpus

All ten fetched to `fixtures/papers/<id>/`, `.tex`/`.bbl`/`.bib`/`.sty` only.
1706.03762, 1810.04805, 1512.03385, 1907.11692, 1409.1556, 2010.11929, 1802.05365,
1502.03167, 1608.06993, 2103.00020.
