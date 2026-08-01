# Motion teardown: Auxia

Reverse-engineered from an 89s screen recording at 1860×904, 30fps. Frame-sampled at
1.2–1.33fps through the transitions. Timings are read off frame indices, so treat them as
±100ms.

This extracts the mechanics. What we take is the system, not the surface.

---

## 1. Hero: a 7-second autoplay build, not a scroll reveal

The single most important finding. Nothing here is scroll-linked. It plays on load and
completes before the user does anything.

| t | What happens |
| --- | --- |
| 0.0 | Headline already present, set low in the frame. Cream field, one faint hairline path at top with two or three dormant nodes. Nothing else. |
| ~2.5 | A blue spine draws left → right across the upper third. Roughly 900ms, ease-out. |
| ~3.0 | Stage labels pop along the spine as it passes them: `ASK AGENT` → `AGENT WORKFLOW` → `AI DECISIONING` → `PERSONALIZE VARIANT`. Small mono caps. Each appears as the line reaches it, so the stagger is a consequence of the draw, not a separate delay. |
| ~3.4 | A white prompt card fades and scales in at the left of the spine (from ~0.96). It carries a sentence of user intent. |
| ~4.0–5.5 | Mono list items stagger in beneath each stage label, left group first, roughly 60–80ms apart within a group and ~400ms between groups. |
| ~5.0 | An image card appears at the right end, **blurred**, and sharpens over ~600ms. It is the output of the pipeline. |
| ~6.7 | The whole assembly translates up ~120px. The headline rises with it. |
| ~7.0 | Subhead fades in below the headline, then two buttons. Opacity plus a short y-offset, ~200ms, ~80ms apart. |

The idea: **the hero is the product running once, left to right, before you have read the
headline.** The spine is the pipeline, the labels are its stages, the card at the end is
the result. Copy arrives last, after the demonstration.

## 2. Section headline: static two-tone, no animation

```
Marketing didn't          ← mid-grey  (setup)
get harder.               ← mid-grey  (setup)
It got stuck.             ← white     (punchline)
```

Three lines, same size and weight. The only variable is colour. No per-line reveal, no
typewriter, nothing moving. The contrast does all the work and it survives a screenshot.

Cheap, and stronger than any animation would have been.

## 3. The signature: two stacked panels, the second slides over the first

This is the moment the page is built around, roughly t=12s to t=20s.

**Panel A — the problem.** A near-black rounded panel, radius ~16px. Inside: a regular
dot field, ~24px pitch, very low contrast. Over it, erratic polylines connecting scattered
node icons. Label reads `Your journeys are a mess` with **mess** in red.

Red ✕ marks fade in **progressively as you scroll** — one or two at first, then five, then
eight. Scroll-linked, not time-linked: the count tracks scroll position.

**Panel B — the resolution.** A royal-blue panel of identical geometry and radius
translates up from below and covers Panel A. Not a crossfade, not a colour morph. It
slides. `Clean them up with Auxia`.

Inside, the same dot field in blue, and the paths **draw left → right** as scroll
continues — SVG `stroke-dashoffset` driven by scroll progress. Nodes sit at even
intervals now instead of scattered. Green ✓ marks appear at the right ends of completed
paths, staggered.

The whole device is one idea: **same geometry, same grid, two states, and the second
physically covers the first.** Before and after in one object rather than two panels side
by side.

## 4. Recurring mechanics

- **Rounded everything.** Cards, panels, images, buttons all at ~12–20px. Nothing square.
- **Cards enter with opacity plus a small scale**, ~0.96 → 1. Never slide from far off-screen.
- **Blur-to-sharp** on the one image that matters. Used once.
- **Stagger is 60–80ms within a group**, ~400ms between groups. Tight enough to read as
  one gesture.
- **Sticky pinning** holds a section while its internal state advances, then releases.
- **A sticky announcement bar** at the very top in the accent colour, above the nav.
- Nothing rotates. Nothing parallaxes. No animated gradients.

## 5. Density and whitespace

The hero headline occupies maybe 15% of the viewport with everything else empty. Sections
run tall with one idea each. Body copy is confined to a narrow right-hand column while the
left stays open. The page is unafraid of empty space, and that is most of why it reads as
expensive.

---

## What is theirs, and must not come across

- The palette: cream, that specific royal blue, and the red/green pair.
- The wordmark and the isometric layered-slab illustration.
- Marketing-funnel language and the customer logo wall.
- The `Your journeys are a mess` / `Clean them up` copy structure.

## What we take

1. A hero that runs the product once, on load, along a spine, before any copy.
2. Two-tone static headlines: setup dim, punchline full contrast.
3. One signature panel-over-panel scroll moment with identical geometry in both states.
4. Progressive path drawing bound to scroll progress.
5. Staggered marks, 60–80ms within a group.
6. Rounded geometry throughout, and much more whitespace than feels comfortable.
7. Sticky pinning to hold a section while its internal state advances.

## How it maps onto residual

The mapping is almost too neat, and it is the reason this reference works for us.

Their spine is a marketing pipeline. **Ours is the verification pipeline**, and it already
exists: `resolving → extracting → mining → checking → adjudicating`. The stage labels are
real, the mono lists under them are real intermediate artifacts, and the card at the end
is a real verdict from the corpus.

Their mess-to-clean panel is a metaphor. **Ours would be literal**: Panel A is a paper's
table as written, Panel B is the same table with each value's siglum and verdict resolved.
Same geometry, same grid, two readings of the same object — which is exactly what an
apparatus criticus is, and what `DESIGN_PLAN.md` already committed to.

We keep the dark chrome and light paper. We take the roundness, the whitespace, the spine
hero, and the one panel-over-panel moment.
