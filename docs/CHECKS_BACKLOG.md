# Checks backlog, integrations, and the model question

What residual could check beyond the four it runs today, what it would have to talk
to, and whether any of it needs a trained model.

**Nothing in this document is built.** Read `BRIEF.md` §9 first: checks 4, 5 and 7
are already specified there and are not repeated here except where a new check
depends on one.

---

## Where things stand

| # | Check | State |
| --- | --- | --- |
| 1 | Bolded value is best in its block | **shipped** (`bold_extreme.py`) |
| 2 | Dead links | **shipped** (`links.py`) |
| 3 | Row arithmetic | **shipped** (`row_arithmetic.py`) |
| 6 | Citation existence and retraction | **shipped** (`citations.py`) |
| 4 | Abstract vs table | specified in §9, not built |
| 5 | Missing variance | specified in §9, not built |
| 7 | Baseline fidelity | specified in §9, not built |

Everything below is new.

---

## The headline recommendation

**Build the statistics checks first (group B). They are the highest-value work
available and they need no model, no network, and no new infrastructure.**

`statcheck` recomputes a p-value from the test statistic and degrees of freedom the
paper itself prints. Run over the psychology literature it found reporting
inconsistencies in roughly half of papers and decision-changing ones in about one in
eight. It is pure arithmetic on three numbers that are already on the page. Nobody
has pointed it at machine learning at scale.

That is the same shape as `row_arithmetic` — recompute a stated quantity from other
stated quantities — which means it fits the existing checker interface with no
architectural change at all. It is the cheapest large increase in what this product
can say.

---

## Group A — internal numerical consistency

Extends what already runs. All deterministic, no model, no network.

| Check | What it does | Effort |
| --- | --- | --- |
| **Column totals** | A `Total` row or column equals the sum of its parts. `row_arithmetic` on the other axis. | S |
| **Percentages sum to 100** | Composition tables, ablation splits, confusion-matrix rows, within a rounding tolerance. | S |
| **Split sizes sum to the stated total** | Train + val + test against the dataset size the paper names. Catches leakage-adjacent bookkeeping errors. | S |
| **Same quantity, two places** | The same named number reported inconsistently across abstract, body and table. This is the Transformer fixture's real finding (41.8 vs 41.0) and overlaps §9 check 4. | M |
| **Stated deltas** | "improves by 2.3 points" against the two cells it refers to. Needs claim mining; the arithmetic is trivial. | M |
| **Monotonicity claims** | "accuracy increases with model size" against the column it cites. | M |
| **Mean ± std against per-seed numbers** | When both the summary and the individual runs are printed, recompute. Airtight when it applies. | S |
| **Parameter count vs architecture table** | Derive parameters from `d_model` / `d_ff` / layers / heads for known architecture families and compare to the stated count. | L |
| **Compute claims** | Stated FLOPs against the `6ND` approximation from parameters and tokens. Wide tolerance, but catches order-of-magnitude errors. | M |

The parameter-count check is the one to be careful with. It is only deterministic
for architectures whose parameter formula is known, so the default answer is
`unverifiable / ARCHITECTURE_NOT_RECOGNISED` and the curated formula table is the
whole check. Same shape as the metric-direction lookup in check 1.

## Group B — statistical validity

**The highest-value group. No model, no network, all arithmetic.**

| Check | What it does | Effort |
| --- | --- | --- |
| **statcheck** | Recompute *p* from the reported test statistic and df. `t(38) = 2.1, p < .01` is recomputable to `p = .042`, and the claim is then wrong. | M |
| **GRIM** | A mean of integer-valued data over *n* items must be a multiple of `1/n`. Reported means that are arithmetically impossible. | S |
| **GRIMMER** | The same argument for standard deviations. | M |
| **Degrees of freedom vs stated n** | `df` implies a sample size; compare against the *n* the paper states elsewhere. | S |
| **Effect size recomputation** | Cohen's *d* from the means and SDs printed beside it. | M |
| **Multiple comparisons** | Count the comparisons reported and whether any correction is named. Almost always `unverifiable`; worth it for the cases where it is not. | M |

GRIM in particular catches things nothing else does, because an impossible mean is
impossible regardless of intent, and the check cannot be argued with. It is about
thirty lines of Python.

Caution that applies to the whole group: these were designed for human-subjects
research with integer scales. GRIM does not apply to a mean over continuous
measurements, and a checker that runs it anyway will produce confident nonsense.
Applicability detection is the hard part, not the arithmetic, and the default when
applicability is unclear is `unverifiable`.

## Group C — submission integrity

**This is what makes it a conference product rather than a paper linter.** Every one
of these answers a question a chair actually asks. All deterministic.

| Check | What it does | Effort |
| --- | --- | --- |
| **Anonymity** | For double-blind venues: `\author` still populated, PDF metadata carrying a name, acknowledgements section present, a GitHub URL containing a username, self-citation phrased in first person ("in our earlier work [12]"). | M |
| **Page limit** | Pages excluding references and appendix, per the venue's own rule. | M |
| **Format compliance** | The venue's style file unmodified, margins and font size untouched, no `\vspace` abuse compressing the paper under the limit. | M |
| **Prompt injection scan** | Text hidden at 0pt, in white, or positioned off-page, written to steer a model that reads the submission. On the landing roadmap as "submission safety". | M |
| **Checklist consistency** | NeurIPS/ICML-style checklists against the paper. "We report error bars: yes" against whether any table has them. | L |
| **Required sections** | Ethics or broader-impact statement present where the venue requires one. | S |

Anonymity and the injection scan are the two most defensible things on this whole
list, because both are binary, both are currently done by hand or not at all, and
neither says anything about the quality of the work.

**Prerequisite: a PDF ingest path.** Anonymity, page limits and format compliance
are properties of the compiled document, not of the LaTeX. That is a real new branch
in ingest, and it is the main cost of this group.

## Group D — bibliography and artifacts

| Check | What it does | Effort |
| --- | --- | --- |
| **Uncited references** | A reference in the bibliography that no `\cite` in the body points at, and the reverse. Trivially deterministic, and it catches fabricated bibliographies, which is a live problem. | S |
| **DOI resolves and matches** | Look up the DOI, compare metadata to the printed reference. By identifier and scored comparison, never by title containment. | S |
| **Preprint superseded** | A cited arXiv preprint since published with different numbers. | M |
| **Repository resolves and is pinned** | The repo exists, and a commit SHA is given. An unpinned repo is unverifiable by construction. Extends `repos.py`. | S |
| **Dataset availability** | Named datasets resolve to a DOI or a known registry. | M |
| **Checkpoint links resolve** | Model and dataset links against the HuggingFace API. | S |
| **Declared dependencies** | "We use PyTorch 2.1" against the repository's `requirements.txt`. | M |

**Uncited references is the cheapest item in this entire document and one of the
most topical.** It is set arithmetic over two lists both present in the source.

---

## Integrations

Already wired: arXiv, Crossref, OpenAlex, GitHub.

**Worth adding, in order of value:**

- **OpenReview.** Free API, and the single most important integration for a
  conference product. It holds submissions, venue metadata, deadlines and
  checklists. It gives you the venue's own rules to check against rather than rules
  you guessed, and it is where chairs already are, which makes it a distribution
  channel and not only a data source.
- **Overleaf.** Where the LaTeX actually lives for most authors. "Check this
  project" is a far shorter path than "export your source and upload it", and it is
  the best acquisition surface available.
- **Semantic Scholar.** Free. Citation contexts, which is most of what check 7
  (baseline fidelity) needs to find where a baseline number came from.
- **Retraction Watch.** Now distributed through Crossref, so partly reachable
  already; worth confirming coverage against the current `citations.py` path.
- **HuggingFace Hub.** Free. Model, dataset and checkpoint resolution.
- **DataCite and Zenodo.** Dataset DOI metadata for the availability check.
- **ORCID.** Author identity, for the anonymity check and eventually for auth.
- **Unpaywall.** Free full text location, so baseline fidelity can read the source
  paper rather than only its metadata.
- **Modal.** For the rerun path when it comes. Python-native, per-second billing,
  sandboxing is a first-class feature rather than something bolted on. Better fit
  than raw RunPod or Lambda for untrusted code.
- **GitHub Actions.** residual as a status check on a paper repository's PR, so the
  numbers are checked at the commit that changes them.

Everything above except Modal is free at the volumes involved. Every one of them
needs the same treatment the existing adapters get: cache to disk keyed by request,
a rate limit that assumes we are a guest, and a 429 that resolves to `unverifiable /
RATE_LIMITED` rather than failing the run.

---

## What has to be built underneath

Most new checks are just new modules behind the existing
`run(ctx: CheckContext) -> CheckResult` interface. Four things are not:

1. **A prose claim miner.** Checks 4, 5, stated deltas and monotonicity all need
   "find the assertion in the body and bind it to a cell." This is the one place a
   model is legitimately used, and it is used for extraction only: it proposes a
   binding, deterministic code verifies the arithmetic, and an unbindable claim is
   `unverifiable`, never a guess.
2. **A PDF ingest branch.** Required by all of group C.
3. **A venue policy registry.** Versioned data, per venue per year, exactly as the
   tolerance policy is versioned. A report must state which policy version it was
   checked against or it is not re-derivable.
4. **A sandbox executor** for the rerun, which is a separate problem and is not
   solved by any of the above.

---

## Do you need to train a model?

**Almost certainly not, and it would be the wrong place to spend effort right now.**

Three reasons:

1. The product rule is that a model never produces a verdict. So a trained model can
   only ever do extraction and matching, which caps the upside sharply.
2. At extraction, a frontier model with structured output beats a small fine-tune at
   any data scale you currently have, and at your volumes it is close to free.
3. Fine-tuning needs labelled data you do not have. Claim-to-cell alignment would
   need thousands of hand-annotated pairs before a trained model beat a prompt.

**The one component that would justify training** is a claim-span classifier: given
a sentence, is this a checkable numeric claim? It runs over every sentence of every
paper, which is exactly the shape where per-call API pricing stops making sense and
a small local encoder wins. Roughly: 2,000 to 5,000 labelled sentences, a ModernBERT
or DeBERTa-size encoder, CPU inference, a day of training. Build it only after the
prompt-based version is working and you can measure what it costs.

Do **not** train a table-structure model. TexSoup plus deterministic parsing is more
accurate on LaTeX, auditable, and does not put a probabilistic component upstream of
every verdict in the system.

**What you actually need instead of a trained model:**

- **A bigger evaluation corpus.** `fixtures/GROUND_TRUTH.md` is the real asset here.
  Ten papers with hand-derived answers is what makes it possible to say the checks
  produce zero false findings. Fifty papers is worth more than any model.
- **The contest flow as a labelling pipeline.** Every amendment an author files is a
  human label on a specific finding produced by a specific checker version. That is
  a training set arriving for free, and it is the reason the amendment schema keys
  on `finding_fingerprint`. Nothing currently harvests it.
- **arXiv bulk source** (S3, requester-pays, low hundreds of dollars for the full
  corpus) if and when you want to measure how often a check fires across the
  literature rather than across ten papers.

---

## Suggested order

1. **Uncited references** and **column totals**. A day each, no new infrastructure.
2. **GRIM** and **statcheck**. The largest capability increase per line of code in
   this document.
3. **Anonymity**, which forces the PDF ingest branch that group C depends on.
4. **§9 check 4** (abstract vs table), which forces the claim miner that groups A
   and B partly depend on.
5. **Prompt injection scan**, once the PDF path exists.
6. **OpenReview**, which turns venue rules from guesses into data.
7. Everything else.
