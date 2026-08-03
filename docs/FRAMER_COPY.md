# Framer copy deck

Paste-ready copy for the landing page (`reserved-hexagon-716530.framer.app`, home node
`RTbM5kfhR`). Written while the Framer MCP bridge was down, so the write pass is
mechanical: find the node holding the **current string**, replace with the **new string**.

**Ownership.** Agent X owns content. Agent W owns nav, footer chrome, outbound social
links, and the `/work/:slug` CMS cleanup. Where those overlap, it is called out inline.

**Every number on this page is traceable.** Sources are listed per section. Nothing
asserts a fact about the world that has not happened: no papers-verified count, no venue
count, no cost figure, no accuracy rate, no testimonial, no logo.

## Number provenance

| Number | Value | Source |
| --- | --- | --- |
| Papers in validation corpus | 10 | `fixtures/papers/PROVENANCE.md`, ten directories |
| Tables parsed | 103 | computed, `corpus_stats_tmp.py` (non-nested tables only) |
| Cells read | 7,014 | computed, same script, all cells in those tables |
| Cells carrying a value | 4,648 | computed, same script |
| Checks that call a model | 0 of 4 | `backend/pv/checks`, CLAUDE.md |
| BERT claimed / computed / delta / verdict | 71.0 / 70.944 / +0.056 / within tolerance | `fixtures/reports/1810.04805.json`, `tab:glue_official` row 3 col 9 |

`corpus_stats_tmp.py` assembles each fixture paper and runs `pv.parse.parse_tables` over
it. Two cross-checks: its CLIP line reads 20 tables and 2,666 valued cells, which matches
the independently written CLIP row in `PROVENANCE.md`; and its cell total is 7,014, which
matches the brief. **Do not use 7,034**, which is stale.

Nested tabulars are excluded from the table count. DenseNet has eight of them used to
stack two lines of text, and counting them would overstate the corpus.

---

## Global: the wordmark

`residual` is lowercase everywhere, including at the start of a sentence and in the
wordmark. The published page capitalises it in six places. Fix all six.

| Where | Current | New |
| --- | --- | --- |
| Nav wordmark | `Residual` | `residual` |
| Footer copyright | `© Residual Studio, 2025` | `© residual, 2026` |
| Body prose, 4 further occurrences | `Residual` | `residual` |

Two notes. The footer copyright sits in Agent W's area, so hand W the string rather than
editing it. The year is also wrong at `2025`; today is 2026. And `Studio` is a leftover
from the template author's agency framing, not our name.

---

# Pass 1

## 1. Hero

Replaces the whole hero block.

| Slot | Current | New |
| --- | --- | --- |
| Eyebrow | `Built for conference and workshop submissions` | `Verification for papers under submission` |
| H1 | `A verification layer for papers under submission` | `The AI-native verification layer for academic research` |
| Sub | `residual checks whether the numbers a paper states agree with each other. An author runs it before submitting and attaches the report. A reviewer or chair reads it instead of redoing the arithmetic by hand.` | `residual checks the numbers in a paper against the numbers its code actually produces. It reruns the experiments on hosted GPUs, compares what comes back against what the paper claims, and issues a verification record you submit alongside the paper.` |
| Primary CTA | `Check a paper` | `Check a paper` (unchanged) |
| Primary CTA link | | `https://paper-verify-indol.vercel.app/check` (absolute) |
| Secondary CTA | none | `See how it works`, anchors to the pipeline section |

### Hero motion

Per `docs/MOTION_TEARDOWN.md` §1, this is a **pinned, scroll-scrubbed build**, not a
fade-in on entry. Sticky container, `scrollYProgress` mapped onto each element's range,
so the user turns the crank and can run it backwards.

The spine is the product running once, left to right. Four stage labels, drawn as the
line reaches them:

```
SUBMIT  ->  RERUN  ->  COMPARE  ->  RECORD
```

| progress | What happens |
| --- | --- |
| 0.00 | H1 pinned, set low. Faint hairline path, four dormant nodes. |
| ~0.15 | Spine draws left to right across the upper third, tracking scroll directly. |
| ~0.20 | Stage labels appear as the line reaches them. The stagger is a consequence of the draw, not a separate delay. |
| ~0.25 | A card fades and scales in at the left (0.96 to 1) showing a paper and a repository. |
| ~0.35–0.60 | Under `COMPARE`, three rows reveal: `claimed 71.0`, `computed 70.944`, `delta +0.056`. |
| ~0.55 | The record card appears at the right end blurred, and sharpens as progress continues. |
| ~0.80 | Assembly translates up, H1 rises with it, pin releasing. |
| ~0.90 | Sub fades in, then the two buttons slightly behind it. |

The record card at the right end reads:

```
verification record
residual / 1810.04805
4 checks run  ·  1 within tolerance
```

That card shows a real run from the corpus, so it is not a fabricated screenshot.

## 2. Pipeline section

This replaces `How a run proceeds` / `Five stages, in order`. The five engine stages
(`resolving`, `extracting`, `mining`, `checking`, `adjudicating`) are internals; they move
into section 5 as a subordinate block.

| Slot | New string |
| --- | --- |
| Eyebrow | `How it works` |
| H2 | `From account to conference in four steps` |

| # | Title | Body |
| --- | --- | --- |
| 1 | `Create an account` | `Sign up. Nothing to install, and nothing to configure on your own machine.` |
| 2 | `Submit the paper, the repository, and the environment` | `Point residual at the LaTeX source, the code that produced the results, and the container image needed to run it.` |
| 3 | `residual verifies and issues a record` | `The experiments run on hosted GPUs. residual compares the numbers that come back against the numbers printed in the paper, and issues a verification record with an ID.` |
| 4 | `Send the paper, the repository, and the record to the conference` | `The venue opens the record by its ID and sees which numbers were checked, which reproduced, and which did not.` |

Below the four steps, one line:

```
Venues use the record to streamline review and to pre-filter machine-generated submissions.
```

### Pipeline motion

Second pinned section, per teardown §3 and §4. Same geometry throughout: four numbered
panels, rounded ~16px. Scroll progress advances which panel is active rather than fading
them in. The connector between panels draws with `stroke-dashoffset` against scroll, the
same mechanic as the hero spine, so the two sections read as one system.

Cards enter with opacity plus scale 0.96 to 1. Nothing slides in from off-screen, nothing
rotates, nothing parallaxes.

## 3. Delete outright

The defensive block below the hero goes. It makes a large product sound small.

- `It verifies numbers, not content.`
- `It has no opinion on whether a paper is novel, interesting, or correct in its ideas.`

Also strip the same framing from FAQ answers in section 7, where the phrase
`It verifies numbers, not content, so it does not replace review` currently appears.

---

# Pass 2

## 4. What residual verifies

Replaces `What it does` and its word-by-word scroll reveal, which currently renders as one
word per line in the HTML and reads badly.

| Slot | New string |
| --- | --- |
| Eyebrow | `What it verifies` |
| H2 | `The paper says 71.0. The code says 70.944.` |
| Body | `A paper states numbers in its abstract, its body text and its tables. residual reads the LaTeX source, reruns the experiments that produced those numbers, and reports every place the paper and the code disagree. Each finding carries the claimed value, the computed value, the delta, and a link to the cell it came from.` |

Verdict chips stay as they are, and keep their glyphs: `matches`, `within tolerance`,
`diverges`, `unverifiable`. Per CLAUDE.md the vocabulary is fixed and colour is never the
only signal.

## 5. Status: today and next

One section, two columns, clearly labelled. This is the honesty distinction the brief
requires kept. It is stated plainly rather than apologetically, and it does not lead with
what the product cannot do.

| Slot | New string |
| --- | --- |
| Eyebrow | `Status` |
| H2 | `What runs today, and what we are building` |

**Column A, heading `Running today`**, sub `Four deterministic checks over LaTeX tables,
validated on a 10-paper corpus.`

| Title | Body |
| --- | --- |
| `Bolded value is best in its block` | `Each bolded number is compared only against the other numbers in its own rule-delimited block, and only when the column's direction is known.` |
| `Average columns match their row` | `A column labelled average, mean or overall is recomputed from the other numbers in the same row, to the precision they were printed at.` |
| `Links resolve` | `Every URL printed in the paper is requested, and the ones that no longer resolve are listed.` |
| `Citations exist` | `Every reference in the bibliography is looked up by identifier, never by title containment.` |

Small print under column A, carrying the five engine stages that used to be their own
section:

```
Each run moves through five stages: resolving, extracting, mining, checking, adjudicating.
Nothing in the four checks calls a language model.
```

**Column B, heading `Being built`**, sub `The direction. Not available yet.`

| Title | Body |
| --- | --- |
| `Rerun from a submitted container` | `An author submits a container image and the run reproduces the numbers in the tables on hosted GPUs, rather than only recomputing them from the source.` |
| `Signed records` | `A signed record identifier a venue can verify belongs to the paper in front of it.` |
| `Venue endpoint` | `An endpoint a chair calls to confirm a record, so a venue can check a submission without contacting the author.` |
| `Claims against tables` | `Matching a number stated in the abstract or the body text to the table cell it refers to, and checking that reported variance is consistent.` |

Closing line for the section, replacing the current `None of this runs yet` paragraph:

```
The corpus numbers on this page come from the four checks above. Nothing in the right-hand
column is counted in them.
```

## 6. Evidence and corpus

Keep the BERT card. It is the strongest thing on the page because it is real.

| Field | Value |
| --- | --- |
| `Paper` | `1810.04805, BERT` |
| `Source` | `tab:glue_official, row 3, column "Average"` |
| `Claimed` | `71.0` |
| `Computed` | `70.944` |
| `Delta` | `+0.056` |
| `Verdict` | `within tolerance` |

All six from `fixtures/reports/1810.04805.json`. Numerics render `tabular-nums`.

Stat band, updated. The fourth tile changes because `0 of 4` needs the reader to already
know what four means.

| Label | Value | Sub |
| --- | --- | --- |
| `Papers in the validation corpus` | `10` | `fixtures/papers` |
| `Tables parsed` | `103` | `fixtures/papers` |
| `Cells read` | `7,014` | `4,648 carry a value` |
| `Checks that call a model` | `0 of 4` | `backend/pv/checks` |

## 7. FAQ

| Question | Answer |
| --- | --- |
| `Who is this for?` | `Authors and venues. An author runs residual before submitting and attaches the record. A programme chair opens the record by ID and sees which numbers reproduced, instead of redoing a table by hand or skipping it.` |
| `What if a finding is wrong?` | `Every finding has a contest action one click away. Contested findings are recorded and rechecked, and the recheck is deterministic, so a corrected input produces a corrected verdict. Contesting does not suppress a finding, because then contesting would become the way to bury a true one. Any high-severity diverges finding is held for human review before it appears publicly.` |
| `Does a language model decide any of this?` | `No. Models extract structure, such as which cells are in a table. Every verdict is computed by deterministic Python from that structure. The four checks running today call no model at all.` |
| `Is this AI detection?` | `It gives a venue something better than detection: a record tying a paper's numbers to code that produced them. A submission with no runnable code and no record stands out on its own.` |
| `Why does a check sometimes decline to answer?` | `Because a verdict published about a named researcher has to be right. When a table cannot be read without discarding something a verdict might rest on, the check returns unverifiable with a stated reason and attaches the comparison as evidence, so you still see the numbers.` |
| `Where do the numbers come from?` | `The LaTeX source, not the PDF. A paper is often many files joined by input and include, with macros defined in one file and used in another, so residual resolves the source and builds the macro table before parsing anything.` |

Keep the `How it decides` reason-code block as it stands. The four codes
(`multiple_bold_in_column`, `metric_direction_unknown`, `cell_spans_columns`,
`average_denominator_ambiguous`) all exist in `backend/pv/models.py`.

Trim its paragraph to drop the repetition now covered by the FAQ:

```
The same paper checked twice gives the same answer. Every verdict is computed by
deterministic Python. A check that cannot be made deterministic returns unverifiable with
a stated reason rather than a guess.
```

## 8. Imagery

The template expects images in the hero and the section breaks. Use Framer's own asset
library or another legitimate free source.

Do not generate screenshots of the rerun feature, the venue endpoint, or signed records.
None of those exist, and a mockup of them on the marketing page is exactly the fabricated
claim the brief rules out. The hero record card is fine because it renders a real run from
`fixtures/reports/1810.04805.json`.

## 9. CMS

The six `/work/:slug` entries (`strida`, `bravo`, `nitro`, `fargo`, `taro`, `haze`) are the
template author's portfolio, not ours. This deck writes no CMS content and nothing in it
links to `/work`. Agent W is deleting them.

---

## Open questions

1. **Cost.** The positioning says the rerun happens at low cost, but any figure would be
   fabricated, so no price appears anywhere in this deck. If there is a real number, the
   pipeline step 3 body is where it goes.
2. **`AI-native` in the H1.** It is the brief's phrase and it is on the banned-adjective
   line without being on the banned list. An alternative that keeps the scope without the
   prefix: `The verification layer for academic research`. Flagging, not deciding.
3. **Footer copyright** is W's node but the string is wrong twice over (`Residual Studio`,
   `2025`). Needs one of us to own it.
