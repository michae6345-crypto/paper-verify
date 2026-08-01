# Report view: design plan

Plan for the anchored two-pane report. Written before implementation, as the brief
requires. Extends the token system in `BRIEF.md` §3. It does not replace it.

## What changes and why

The report is a flat list of check results. A flat list says every check matters equally
and says nothing about where in the paper a claim lives. The fix is to anchor each claim
to its span in the source and let the two panes drive each other.

## One conflict to settle first

`BRIEF.md` §7 fixes the vocabulary at `matches`, `within tolerance`, `diverges`,
`unverifiable`. This brief asks for three states: VERIFIED, DISCREPANCY, UNVERIFIABLE.
The `Verdict` enum is also frozen contract and append-only storage depends on it.

Resolution: keep the five stored values and group them for display.

| Stored `Verdict` | Ledger group |
| --- | --- |
| `matches`, `within_tolerance` | Verified |
| `diverges` | Discrepancy |
| `unverifiable`, `not_attempted` | Unverifiable |

A `within_tolerance` row still shows its delta inside the Verified group, so the tolerance
result is not hidden. Nothing about the data model moves.

## Palette additions

Five values. None of them is a verdict colour, because verdict colour is reserved and
already carries meaning.

| Token | Hex | Use |
| --- | --- | --- |
| `--anchor-rest` | `#3A4450` | A span in the paper that a claim points at, unselected. A 2px left rule, not a fill. |
| `--anchor-live` | `#FFF3C4` | The selected span. Already used at §5.4; promoted to a token. |
| `--anchor-trace` | `#6A7BFF1F` | The connecting tint on the ledger row paired with the live span. 12% of `--focus`. |
| `--provenance-line` | `#4A5563` | Hairline used to hatch the INFERRED tag. Reads as texture, not status. |
| `--ledger-band` | `#191E25` | Group header band in the ledger. Sits between `--chrome-base` and `--chrome-panel`. |

Provenance is deliberately not a colour pair. EXTRACTED and INFERRED are told apart by
fill: EXTRACTED is a solid 1px-bordered chip, INFERRED is the same chip with a 45° hairline
hatch in `--provenance-line` and the word spelled out. Colour-blind safe, survives
greyscale, and it cannot be confused with a verdict.

## Type

No new families. Three roles across the three faces already loaded.

- **Display — Source Serif 4.** Ledger group headings sit in the dark chrome in the
  paper's own serif. The instrument quotes the document it is examining. This is the
  §2 two-material idea applied one level down.
- **Body — Instrument Sans.** All ledger prose, labels, controls.
- **Numeric and utility — IBM Plex Mono.** Every value, delta, page reference, checker
  name, and policy version.

IBM Plex Mono was checked against the brief's requirement rather than swapped for
novelty. It ships a slashed zero, an l with a tail against a serifed 1, and monospace
figures are tabular by construction. It already meets the bar, so it stays.

## Desktop

```
┌────┬──────────────────────────────────────┬──┬───────────────────────────────────┐
│    │ PAPER                                │G │ CLAIMS LEDGER                     │
│ N  │ light, Source Serif 4, 68ch          │U │ dark, virtualised                 │
│ A  │                                      │T │                                   │
│ V  │  4.2 Results                         │T │ ┌───────────────────────────────┐ │
│    │                                      │E │ │ Discrepancy            2      │ │ <- serif
│ 56 │  Our model reaches ▏87.4 BLEU on     │R │ ├───────────────────────────────┤ │
│ px │  ▏the held-out split, outperforming  │  │ │ ▏87.4 claimed  84.1 computed  │ │ <- anchor-trace
│    │  ▏all prior work.                    │◤ │ │  p4 L112  bold_extreme v1.0.0 │ │
│    │   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^      │  │ │  policy v1   [EXTRACTED]      │ │
│    │   anchor-live #FFF3C4                │  │ │  Explain ▸                    │ │
│    │                                      │— │ ├───────────────────────────────┤ │
│    │  Table 3                             │  │ │ Verified               11     │ │
│    │  ┌──────┬──────┬──────┐              │  │ ├───────────────────────────────┤ │
│    │  │ Model│ BLEU │ Cost │              │○ │ │ Average column, table 1       │ │
│    │  ├──────┼──────┼──────┤              │  │ │  71.0 stated  70.944 computed │ │
│    │  │ Ours │▏84.1 │ 3.3e18│             │  │ │  within tolerance ±0.05       │ │
│    │  └──────┴──────┴──────┘              │  │ ├───────────────────────────────┤ │
│    │                                      │  │ │ Unverifiable            6     │ │
│    │                                      │  │ ├───────────────────────────────┤ │
│    │                                      │  │ │ Table 4 is not machine-       │ │
│    │                                      │  │ │ readable. No values to        │ │
│    │                                      │  │ │ compare.        [EXTRACTED]   │ │
│    │                                      │  │ └───────────────────────────────┘ │
└────┴──────────────────────────────────────┴──┴───────────────────────────────────┘
        55%                                 48px            45%
```

The gutter keeps its §2 job. Marks align to the anchored span and stay in sync on scroll.

## Mobile

```
┌─────────────────────────┐   Paper and ledger become one column.
│ ← Attention Is All You  │   The ledger is a sheet over the paper,
│   Need                  │   dragged up from the bottom.
│  ─────────────────────  │
│                         │   Gutter marks collapse to inline badges
│  4.2 Results            │   on the anchored span, per §4.
│                         │
│  Our model reaches      │   Selecting a claim collapses the sheet
│ ▏87.4 BLEU on the       │   to a peek row and scrolls the paper.
│ ▏held-out split.        │   The link still works in one column;
│                         │   it just costs a collapse.
│ ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │  ▲ Claims      19   │ │ <- drag handle, peek state
│ │ ┌─────────────────┐ │ │
│ │ │ Discrepancy  2  │ │ │
│ │ │ 87.4 vs 84.1    │ │ │
│ │ │ p4 L112         │ │ │
│ │ │ [EXTRACTED]     │ │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

## Motion

One orchestrated moment. Rows carry a `layoutId` keyed on `claim.content_hash`, so a row
moving from the checking group into a verdict group animates to its new position instead
of disappearing and reappearing. 180ms, `easeOut`, no overshoot.

Everything else is a state change: 120ms opacity and 1px stroke on gutter activation,
300ms `easeInOut` scroll to an anchor, 200ms highlight fade that then holds. Under
`prefers-reduced-motion` every one of these becomes instant, including the layout
animation, which drops to a plain reorder.

## Self-review against the brief

Four things in the first draft of this plan were generic dashboard, and are now cut.

1. **A summary strip of large counts across the top.** Cut. Counts belong on the group
   headers where they label something. A row of big numbers above a report is one
   refactor away from being read as a score, which the brief forbids for good reason.
2. **Red, amber and green status pills on every row.** Cut. Verdict already has colour
   plus a distinct glyph. Adding a pill would put the same signal in three places and
   spend the eye's attention on rows that are fine. Discrepancy earns emphasis; verified
   does not.
3. **A sortable, filterable, zebra-striped claims table.** Cut. Sorting a ledger breaks
   the anchor: document order is what makes the paper pane and the ledger correspond.
   Grouping by verdict with document order inside each group keeps it.
4. **A colour pair for EXTRACTED and INFERRED, probably blue and violet.** Cut. It would
   have created a second colour system arguing with the verdict colours, and it fails in
   greyscale. Fill and hatch carry it instead.

One thing I would have skipped and kept because the brief is right to demand it: the
`policy_version` on every discrepancy row. It looks like internal detail. It is the thing
that lets an author argue with a specific tolerance rule rather than with the verdict, and
that argument is the whole point of the amendment flow.
