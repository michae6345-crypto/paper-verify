# Design plan: residual

Plan first, per the brief. No code until this is signed off.

The tool is renamed **residual**, lowercase everywhere including sentence starts. A
residual is the difference between an observed value and a predicted one, which is
exactly what this product computes and shows. The name states the method rather than the
claim, which suits a tool that refuses to publish a verdict it cannot derive.

## The idea we design from

The reference's metaphor is a plan drawing, because it sells infrastructure. Ours has to
come from our own subject.

Our subject is the **critical apparatus of a scholarly edition**: the apparatus criticus
at the foot of a page, where an editor records that one manuscript reads *41.8* and
another reads *41.0*, marks each witness with a siglum, and declines to say which is
correct when the evidence does not settle it.

That is this product, precisely. We record a claimed reading against a computed one, cite
where each came from, and return `unverifiable` when we cannot choose. The apparatus is
a thousand-year-old solution to our exact problem, and no dev-tool site looks like one.

## Palette

Six values, extending `BRIEF.md` §3. None replaces anything.

| Token | Hex | Use |
| --- | --- | --- |
| `--field-paper` | `#FBFAF8` | Light section field. Promotes the existing paper colour to a section background. |
| `--field-deep` | `#101419` | Dark section field. Sits below `--chrome-base` so a section reads as deeper than the app chrome around it. |
| `--rule-grid` | `#E3DFD8` | Hairline construction grid on light fields. |
| `--rule-grid-deep` | `#232A33` | The same grid on dark fields. One grid, two inks. |
| `--wash` | `#DCE1F5` | The single highlight block behind one phrase per section. A pale wash of `--focus`, so the accent is our interactive colour diluted rather than a new hue. |
| `--siglum` | `#8A7F6D` | Marginal ink: sigla, line numbers, apparatus marks. Warm grey against cool chrome, the way a pencil note sits on a printed page. |

`--siglum` is warm on purpose and is the only warm value in the system. It is a neutral,
not an orange, so it does not become the terracotta accent the brief warns about.

## Type

No new families. Three roles across three faces already loaded, which keeps the page
weight down and ties the site to the document pane.

- **Display: Source Serif 4.** Variable, with an optical size axis. At 56px and above it
  picks up stroke contrast on its own, so the display voice comes from the face adapting
  rather than from a second family. It is also the face the paper pane is set in, so the
  site and the document speak the same way.
- **Body: Instrument Sans.** Neutral and quiet. It carries no personality because the
  serif carries it, which is the pairing logic taken from the reference.
- **Data: IBM Plex Mono.** Checked against the requirement rather than swapped for
  novelty: slashed zero, tailed `l` against a serifed `1`, and monospace figures are
  tabular by construction. Numbers are the product, so this face is used for every value,
  delta, line reference, and siglum.

Hierarchy comes from size and from the serif-to-sans switch. Bold is used almost nowhere.

## Layout, desktop

```
┌──────────────────────────────────────────────────────────────────────┐
│ residual                        how it works   what it can't   check │  <- 56px
├──┬───────────────────────────────────────────────────────────────┬───┤
│  │                                                               │   │
│ 1│  ▏ VERIFICATION                                               │   │  <- eyebrow: rule + mono
│ 2│                                                               │   │
│ 3│  Papers should agree                                          │   │  <- Source Serif 4, 64px
│ 4│  with ░░░░░░░░░░░░░                                           │   │  <- --wash behind one phrase
│ 5│  ░themselves░                                                 │   │
│ 6│                                                               │   │
│ 7│  residual reads a paper's LaTeX and recomputes the numbers     │   │  <- Instrument Sans 18px
│ 8│  it states. It does not judge the paper.                      │   │
│ 9│                                                               │   │
│10│  [ Check a paper ]   Read a finished report                   │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│11│  │ 1706.03762   attention is all you need                   │  │   │  <- live run loop
│12│  │ ────────────────────────────────────────────────────────│  │   │
│13│  │ a  bolded value is best in block        matches          │  │   │
│14│  │ b  average columns match their row      not checked      │  │   │
│15│  │ ○  citation existence                   unverifiable     │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
└──┴───────────────────────────────────────────────────────────────┴───┘
  ^ line numbers in --siglum, mono, running the full height of the field
```

Section fields alternate `--field-paper` and `--field-deep`, full bleed. The line-number
column and the hairline grid cross every field unchanged, so the page reads as one
document that changes colour.

The apparatus section, which replaces a feature grid:

```
│  ▏ WHAT IT CHECKS                                                    │
│                                                                      │
│  Four checks, each one arithmetic you could redo by hand.            │
│                                                                      │
│  a   bolded value is the best in its block                           │
│      ┌────────────────────────────────────────────────────────┐      │
│  41  │ claimed    41.29        block 2, ensembles              │      │  <- apparatus entry
│      │ computed   41.29        matches                         │      │     mono, tabular
│      │ source     tab:wmt-results r9 c2   EXTRACTED            │      │
│      └────────────────────────────────────────────────────────┘      │
│                                                                      │
│  b   average columns match their row                                 │
│      ┌────────────────────────────────────────────────────────┐      │
│  71  │ claimed    71.0                                         │      │
│      │ computed   70.944       within tolerance                │      │
│      │ source     tab:glue_official r3 c9   EXTRACTED          │      │
│      └────────────────────────────────────────────────────────┘      │
```

Each entry is a real finding from the corpus. The siglum (`a`, `b`) and the line number
sit in the margin in `--siglum`, exactly as an apparatus cites a witness.

## Layout, mobile

```
┌─────────────────────┐   One column. The line-number margin narrows
│ residual        ☰   │   to 24px and keeps running, because it is the
├─┬───────────────────┤   thing that makes the page feel like a document
│1│ ▏ VERIFICATION    │   rather than a stack of cards.
│2│                   │
│3│ Papers should     │   Display drops 64px → 34px. The wash highlight
│4│ agree with        │   still covers exactly one phrase.
│5│ ░themselves░      │
│6│                   │   Apparatus entries stack; the siglum moves from
│7│ residual reads a  │   the margin to a leading chip on the entry, so
│8│ paper's LaTeX...  │   the margin never carries meaning it alone holds.
│ │                   │
│ │ [ Check a paper ] │
│ │                   │
│9│ ┌───────────────┐ │
│ │ │ a  bolded ... │ │
│ │ │ claimed 41.29 │ │
│ │ │ computed41.29 │ │
│ │ └───────────────┘ │
└─┴───────────────────┘
```

The report view keeps the two-pane wireframe already approved in `docs/UI_PLAN.md`. This
plan changes its palette and type roles, not its structure.

## Signature

**The margin apparatus.** A line-number and siglum column, set in `--siglum` mono,
running the full height of every section on both light and dark fields, with each claim
and finding cited by a stable siglum that is the same mark in the margin, in the ledger,
in the document pane, and in the exported PDF.

One element. Everything else stays quiet: no shape system, no illustration, no scattered
marks. The margin is the only ornament and it is functional, because the siglum is how a
reader moves between the four places a claim appears.

## Motion

One moment: ledger rows settling into verdict groups on a shared `layoutId`, already
specified in `UI_PLAN.md`. On the site, the hero run loop reuses that same component and
that same animation, so the page demonstrates the product's one motion rather than adding
a second. Everything else is a plain state change. Under `prefers-reduced-motion`
everything becomes instant.

No scroll reveals. No animated gradients. No parallax.

## Self-critique

Four decisions in the first draft were things I would have produced for any dev-tool
site. Each is revised.

1. **A feature bento grid, unequal cells, one per check.** Cut. It is on every developer
   site including the reference, and it presents checks as marketing tiles. Replaced with
   the apparatus entry, which shows a real claimed-versus-computed pair from the corpus in
   the form a textual editor would use. The content is more specific and the form is ours.

2. **Small accent squares scattered at section edges, taken from the reference.** Cut.
   This was the most directly liftable thing on their site and would have been the giveaway.
   The structural role, small marks on the grid near section boundaries, is kept, but the
   primitive is now line numbers and sigla. Same job, from our subject rather than theirs.

3. **A bright accent used on buttons and highlights.** Cut. `BRIEF.md` §3 allows exactly
   one interactive colour and reserves verdict colours for verdicts. An accent on buttons
   would have made three colour systems. `--wash` now appears only behind one phrase per
   section, and buttons stay neutral.

4. **A stat row of large counters.** Cut, again. `UI_PLAN.md` already cut it from the
   report for a specific reason: a row of big numbers above a verification result is one
   reading away from a score, and the brief forbids scores. The same argument applies on
   the landing page, where it would be read as a quality rating of the papers we checked.

Two defaults the brief names, and where we stand:
- Cream background, serif display, terracotta accent. We use a cool off-white, not cream,
  and our only warm value is a grey used for marginal ink at small sizes.
- Near-black with one acid accent. Our accent is a pale wash of the existing interactive
  blue, at low chroma, used behind text rather than as a signal colour.
- Broadsheet hairline rules at zero radius. We keep hairlines, and we keep the existing
  6px and 4px radii rather than squaring everything off.

## After it is built

The brief asks for one thing to be removed at the end. My prediction, to be tested
against the built page: the hairline vertical rules at the outer margins. The line-number
column already establishes the grid, and the outer rules will turn out to be the
decoration doing the least work.
