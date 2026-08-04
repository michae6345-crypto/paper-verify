# How Framer does it, and what we take

`MOTION_TEARDOWN.md` was reverse-engineered from a screen recording. It records
*what* the reference does and it could not see *how*, because a video does not
contain an implementation. This is the other half: what Framer actually ships,
read out of Framer's own documentation and Motion's source, and what of it maps
onto the library we already have.

Scope note up front: **no dependency was added.** Everything below is Motion 12
(`motion/react`, already installed) and Lenis. Where the answer turned out to be
a paid plugin — Motion+'s `splitText`, GSAP's SplitText — the mechanic is
reimplemented rather than bought, and §3 says what that costs.

---

## 1. Framer has two mechanics, and we only had one of them

Framer's effects panel offers exactly two things, and the distinction is sharper
than the one this codebase had drawn:

**Appear effects** fire once, when an element enters the viewport. The animation
plays at its own pace and then the element sits still. This is `reveal.tsx`.

**Scroll transforms** bind the animation to scroll position. As the reader
scrolls, the element moves in proportion to how far the page has travelled. This
is `motion/scrub.tsx`.

That much we had. What we did not have is Framer's **trigger** model, which is
the part worth stealing:

| Framer trigger | What it means | Our equivalent |
| --- | --- | --- |
| `On scroll` | The whole document, top to bottom. Framer's own docs describe the result as "very slowly and gradually". | Nothing. We should never build this. |
| `Layer in view` | The transform runs across the element's own arrival and departure. | `useOwnTrack` in `motion/mobile.tsx`. |
| `Section in view` | Bound to a named section, with the trigger point selectable at the top, centre or bottom of the viewport. | `useSectionProgress` plus a hand-placed window. |

Two things fall out of that table.

The first is that **`Layer in view` is Framer's default idiom and it is the one
`mobile.tsx` had to invent under pressure.** The measurement crisis recorded in
that file — thirty of seventy-nine elements animating below the fold at 390×844,
twenty-three of them at opacity 0 — is the failure mode of `Section in view`
used everywhere, and the fix that file arrived at independently is exactly
Framer's other trigger. It was scoped to the narrow layout because that is where
the bug was found. It is not narrow-specific: an element measured against its
own travel is correct at every width, and the new primitives here default to it
at every width and take a section's progress only when explicitly handed one.

The second is that Framer's `Section in view` exposes a **trigger point** rather
than a raw 0..1 offset. "Start when the top of this section reaches the centre
of the viewport" is a sentence; `from={0.309}` is not. `useSectionProgress`'s
doc comment already derives the arithmetic that converts between them, which
means the constants scattered through this page could be expressed the readable
way. That is a refactor of section files, which this workstream does not own, so
it is a recommendation and not a change.

**Properties.** Framer's scroll transforms animate position, scale, rotation and
opacity. Four. Not filter, not colour, not layout. `MOTION_TEARDOWN.md` §4 says
the reference uses three of those four and refuses rotation; our `Scrub` adds
blur, which the reference uses exactly once, on one image. That is the correct
size for this vocabulary and it should not grow.

---

## 2. Easing is the finding

Framer applies an **easing curve to the scroll range itself**, not only to
time-based transitions. Their scroll-transform workflow is "define From and To,
choose a trigger, adjust the scroll-range and easing curve." Every scroll
transform on a Framer site is shaped by a curve.

Ours were all linear. That is the single largest gap between this page and the
reference, and it is one option on a function we were already calling: Motion's
`useTransform` takes `ease` alongside `clamp`, and accepts one easing function
or one per segment.

Motion ships the easings — `cubicBezier`, `easeIn/Out/InOut`, `circ*`, `back*`,
`anticipate`, `steps`, plus `mirrorEasing` and `reverseEasing` — and all of them
are re-exported from `motion/react`. Nothing needs installing.

### What a curve does to a scrub, which is not what it does to a tween

In a tween the curve reshapes time. In a scrub there is no time: the input is
the reader's scroll position inside the window, so the curve reshapes
**distance**. Measured as the fraction of the change completed at each point of
the window:

| curve | 0.10 | 0.25 | 0.50 | 0.75 | 0.90 |
| --- | --- | --- | --- | --- | --- |
| linear (what shipped) | 0.100 | 0.250 | 0.500 | 0.750 | 0.900 |
| Motion's own `easeOut` | 0.160 | 0.378 | 0.685 | 0.907 | 0.983 |
| `EASE.glide` (0.33, 1, 0.68, 1) | 0.272 | 0.578 | 0.872 | 0.983 | 0.999 |
| `EASE.settle` (0.22, 1, 0.36, 1) | 0.401 | 0.765 | 0.961 | 0.997 | 1.000 |
| `EASE.arrive` (0.16, 1, 0.3, 1) | 0.494 | 0.825 | 0.972 | 0.998 | 1.000 |
| `EASE.travel` (0.65, 0, 0.35, 1) | 0.009 | 0.071 | 0.500 | 0.929 | 0.991 |

Two consequences.

**An out-curve makes every existing window safer.** The failure
`useSectionProgress` warns about is one-directional — a window that opens late
leaves an element on screen and invisible — and an out-curve resolves the
element earlier inside the same window. 87% arrived at the halfway point with
`glide`, against 50% linear. Every window on this page gains margin against the
bug that has bitten it twice, for free, without moving a single constant.

**The mirror image is a trap, and it is the recurring bug of this codebase
wearing a new hat.** `EASE.travel` is at 0.071 a quarter of the way through its
window. An in-curve on anything carrying opacity manufactures the "invisible
while on screen" failure deliberately, and it does it in a way the existing
probe cannot catch: `scripts/probe-motion.mjs` checks where windows are placed,
and here the window is placed correctly and the element still is not there. So
the rule, written into `motion/easing.ts`:

> Anything that fades uses an **out**-curve. The one in-out curve in the set is
> for a property whose start value is already legible — a `Cover` panel is fully
> opaque for the whole of its travel, so easing into its start position cannot
> cost the reader anything. That is the only case.

### Why not Motion's own named curves

Motion's `easeOut` is `cubicBezier(0, 0, 0.58, 1)` — the CSS `ease-out`, and
very mild. Spread over 400px of scrolling it is barely distinguishable from
linear. The curves that read as expensive are the higher-order ones. The four in
`EASE` are the published cubic-bezier approximations of the classic families
(expo, quint, cubic out; cubic in-out); each was checked numerically against its
analytic function over 101 samples, and the worst error in the set is 0.012
(`arrive` against `1 − 2⁻¹⁰ᵗ`), well under a perceptible opacity step.

They are named for what they are used on, not for their mathematics, because the
mathematics is not the decision a consumer is making.

### One hazard, found by reading the source

`useTransform`'s `ease`, given an **array**, falls back to Motion's internal
`noop` for any index the array does not cover — and `noop` returns `undefined`,
not its input. A multi-segment range with a short ease array therefore produces
`NaN` on the uncovered segments and the element vanishes. Anything building a
range of more than two points must pass a full-length array; `motion/easing.ts`
exports `LINEAR` to occupy slots that want no shaping.

Conversely, `ease: undefined` is exactly identical to omitting the option —
`createMixers` guards with `if (ease)`. That is what makes adding `ease` to
`Scrub` and `Cover` a genuinely zero-risk additive change.

---

## 3. Text

Framer's text effects split a text layer into **characters, words, lines or the
whole element**, then animate each unit with its own offset, scale, blur and
opacity, staggered. Two delays: an initial delay before the first unit and a
stagger delay between units, with 0.05s cited as the typical value. Trigger is
the same three-way choice as everything else — Appear, Layer in view, Section in
view.

This page had one word-by-word scrub in `intro.tsx` and nothing else.

### The layout constraint that quietly ruins a split

A transform needs a box, so every animated unit must be `inline-block` — and an
`inline-block` cannot break across lines. Put a whole line in one and it will
not wrap; put a space inside one and the browser has nowhere to break, so a long
paragraph runs off the side of a phone. The structure is therefore fixed:

- every **word** is an `inline-block`, so it moves as a unit and never breaks
- the **spaces between words are real text nodes** between those blocks, which
  is the only place a line may break
- in character mode each word gets a plain `inline-block` wrapper, with the
  characters as `inline-block`s inside it

This is why the text primitives take `text: string` and not `children`. A split
has to own the string to put the spaces back in the right places; handed
arbitrary nodes it would have to walk and rebuild them, and the first `<em>` in
the copy would be flattened.

### The accessibility finding, which contradicts every guide

Every source on splitting text — GSAP's SplitText docs, the CSS-IRL write-up,
the Motion recipes — says: `aria-label` on the container, `aria-hidden` on the
pieces. **That advice is wrong for the elements display copy actually uses.**
ARIA prohibits accessible naming on the `generic`, `paragraph`, `emphasis` and
`strong` roles, which is to say on `<div>`, `<p>` and `<span>`. An `aria-label`
on a `<p>` is not a name; it is ignored — and the split spans underneath it are
still `aria-hidden`, so the paragraph is announced as empty. The failure is
silent and total.

What `motion/text.tsx` does instead, split by risk rather than uniformly:

- **Word and line splits keep their text and hide nothing.** An `inline-block`
  span containing a whole word is still phrasing content with a text node in it.
  Assistive technology concatenates the paragraph as written, find-in-page
  matches, selection copies clean text. Nothing needs fixing, so nothing is
  done. This is the default and the mode almost everything should use.
- **Character splits carry a hidden copy.** One character per element does
  defeat some screen readers, so a character split renders the real sentence
  once in an `sr-only` span and marks the visual layer `aria-hidden`. The
  `sr-only` copy is `user-select: none`, so copying the paragraph yields the
  text once rather than twice.

The cost of the character mode, stated rather than buried: the sentence is in
the DOM twice, so find-in-page can land on the invisible copy. It applies only
to a mode the caller opts into, which is why `by` defaults to `"word"`.

### Line reveals: given, not measured

The masked line reveal — each line in a box that clips, translated down by its
own height, sliding up to rest — is the gesture a Framer site is most
recognisable for, and it is what Framer's community components ("Text Reveal
Animated", the various mask-text components) all implement.

GSAP's SplitText and Motion+'s `splitText` detect real line boxes: render the
words, read where each landed, group by vertical position, wrap each group.
`LineMask` **refuses to do this** and takes `lines: string[]` from the caller.
Three reasons, all specific to this page:

1. **It needs a second pass.** Render, measure, re-render with wrappers — so the
   first committed frame has the wrong structure, and `motion/scrub.tsx` spends
   its entire module comment on the principle that the first painted frame must
   already be right.
2. **It is not stable.** Line boxes move when a webfont swaps, and this page
   loads webfonts. They move again on resize, and re-splitting inside a `Pin`
   changes the frame's height, which trips the `ResizeObserver` in
   `useOverflowWarning` and re-measures the very track the reveal is scrubbing
   against. A measurement that feeds its own input is the feedback loop `Rise`
   exists to avoid.
3. **It is not needed.** A masked line reveal is a display-type gesture. Body
   copy reflows and should be revealed by word, which needs no measurement.
   Display type here is already hard-broken by the designer, because where a
   headline breaks is a typographic decision — `MOTION_TEARDOWN.md` §2 quotes
   the reference's three-line headline as three authored lines.

The consequence the caller accepts: a line that wraps will be masked wrong,
because the mask is one line tall and the text is two. Keep the strings short
enough to hold at 390px.

One detail that betrays a mask reveal built by someone who only tested it on a
headline with no descenders: the clip box has to extend below the text box, or
every `g` and `y` is sheared off flat. `MaskedLine` pads 0.16em down and takes
the same amount back off the flow.

---

## 4. Stagger

`MOTION_TEARDOWN.md` §4 already had this right — "stagger is measured in scroll
distance, not milliseconds", items within a group overlapping heavily and groups
clearly separated. What was missing is that every section implemented it again
by hand.

The parameter nobody was naming is **overlap**. A stagger written as "each item
starts 0.04 later and runs for 0.12" has an overlap of 0.67 buried in the ratio
of two constants, and changing either changes both the rhythm and the duration.
`motion/stagger.ts` states it directly and holds the span fixed as it varies:
the first item always opens at `from`, the last always closes at `to`, whatever
the overlap and whatever the count. A stage gaining a line does not push the
last one past the end of the pin.

Framer's own model is a time delay per unit, which is right for an appear effect
and wrong for a scrub — a delay in milliseconds inside a scrubbed sequence
reintroduces exactly the queueing that scrubbing exists to eliminate. So
`RevealText` (appear) uses Motion's `staggerChildren` and everything scrubbed
uses windows.

---

## 5. Springs

Framer has moved its transition UI off stiffness/damping/mass onto **time and
bounce**, and describes why: springs become "much easier to mix with easing
transitions and can be used reliably in animation sequences." Motion supports
exactly that pair — `visualDuration` and `bounce`, where 0 is no overshoot and 1
is very bouncy — and it is a better interface for the same physics. A reader of
`{ visualDuration: 0.18, bounce: 0 }` knows what it will look like; a reader of
`{ stiffness: 220, damping: 40, mass: 0.4 }` has to compute a damping ratio to
find out whether it overshoots. `SPRING` in `motion/easing.ts` is stated in
Framer's units.

Two rules came out of this and both are in the code:

**Bounce is forbidden on anything driven by scroll.** A spring following a
scrubbed value with bounce overshoots its target, so a line drawing toward a
node goes past it and comes back, which reads as the line having missed. This is
the failure `DrawLine`'s comment describes; its overdamped ζ ≈ 2.1 is the same
conclusion reached the long way round.

**`skipInitialAnimation: true` is mandatory when springing scroll progress.**
Motion added the flag for this case and its own scroll example passes it.
`useScroll` measures its target in an effect, so the first real value arrives
after the first render — and on a page loaded at a scroll position that is not
the top, it arrives as a large jump. Without the flag the spring plays that jump
as an animation nobody asked for, and every scrubbed element in the section
sweeps through its whole window on load.

---

## 6. Two things Framer does that we should know about and are not adopting

**Optimised appear animations.** Framer compiles appear effects to WAAPI
animations that start before React hydrates, then hands them off to Motion once
it loads — `startOptimizedAppearAnimation` and `optimizedAppearDataAttribute`
are in the framer-motion bundle for this, and the handoff resyncs against
`document.timeline.currentTime` before cancelling the WAAPI animation. It is
genuinely clever and it solves a problem we have solved differently.

We are not adopting it. The API is semi-private, the handoff is the fiddliest
code in the library, and our equivalent problem — an animated tree that must not
disagree with the server — is already answered by `useReducedMotionGate` and the
layout-effect swap, which is documented, tested and understood by four
workstreams. Swapping a known mechanism for a cleverer unfamiliar one, to fix a
flash nobody has reported, is not a trade worth making. It is written down here
so the next person does not have to find it again.

**Native `ScrollTimeline`.** Motion already uses browser-native `ScrollTimeline`
where available, so `useScroll` is hardware-accelerated for free on browsers
that have it. Nothing to do; worth knowing before anyone proposes hand-rolling a
scroll listener for performance.

---

## 7. What was built

All in `frontend/src/components/site/motion/`. Additive only — no existing
export changed shape, and the two new optional props default to the behaviour
that shipped.

| File | Exports | For |
| --- | --- | --- |
| `easing.ts` | `EASE`, `SPRING`, `LINEAR`, `Curve` | The curve set and the rule for choosing one. |
| `stagger.ts` | `staggerWindows`, `groupWindows`, `shiftWindows`, `ScrubWindow` | Overlapping windows, once, instead of per section. |
| `text.tsx` | `ScrubText`, `LineMask`, `RevealText` | Per-word, per-character and per-line reveals. |
| `hold.tsx` | `Hold` | Enter, hold, exit — a pin that releases rather than cuts. |
| `spring.ts` | `useScrubSpring` | Smoothing any scrubbed value, not just a stroke. |
| `scrub.tsx` | `Scrub` gains `ease?`, `Cover` gains `ease?` | Curves on the windows that already exist. |

---

## 8. What we refuse, and why

Most of these are restraints `MOTION_TEARDOWN.md` §4 already recorded. Research
gave several of them a second, independent reason, which is worth having.

**Parallax.** The teardown says the reference has none. Framer offers it and
Motion's docs lead with it. It stays refused: a parallax layer is a layer that
never arrives anywhere, and every window on this page is placed by the
arithmetic of an element reaching a reading position. There is no reading
position for a layer whose whole purpose is to not be where it appears to be.

**Rotation.** Framer's scroll transforms offer it as one of their four
properties. §4: nothing rotates. Type that rotates resamples for the length of
the animation, and this page is mostly type.

**Animated gradients.** §4 again. Also not compositable: a gradient repaint is
main-thread work every frame, and the one property class Motion cannot
hardware-accelerate.

**Velocity-driven skew.** A common Framer-adjacent trick — read `useVelocity` on
the scroll value and skew the content by it. It is a rotation by another name,
it fights `Lenis`'s smoothing (you are reading the derivative of a value that is
already a low-pass filter of the input), and it makes the page appear to bend
when the reader flicks. Refused.

**A whole-document scroll trigger.** Framer's `On scroll` maps a transform
across the entire page. Their own documentation describes the result as "very
slowly and gradually", which is an accurate description of an animation nobody
can perceive. Everything here is bound to an element or a section.

**Auto line detection.** §3 above. Three reasons, the strongest being that it
re-measures the track it is animating against.

**A new dependency.** GSAP + ScrollTrigger + SplitText was the obvious route and
is what most "rebuild a Framer site" tutorials reach for. SplitText is a paid
plugin, ScrollTrigger duplicates `useScroll`, and running two animation
libraries against one scroll position means two sources of truth for where the
reader is. The mechanics were reimplemented in ~250 lines instead.

**Motion+'s `splitText`.** Same conclusion, smaller: it is 0.7kb and it is
behind a membership, and it does DOM manipulation on a node React owns.

**`useReducedMotion` from `motion/react`.** The framer-motion skill's own
guidance recommends it, and it is a hydration bug in this codebase specifically.
`useReducedMotionGate` is the only gate; `motion/scrub.tsx` explains at length
why, and everything added here routes through it.

**A hand-set `will-change`.** The skill guidance recommends setting
`willChange` on animating elements. Reading `motion-dom`'s
`addValueToWillChange` shows this is counterproductive: Motion manages the
property itself, and it only does so when the value is absent or is its own
`WillChange` motion value — a static string makes it skip management entirely.
On a split paragraph it would also promote one compositing layer per word, held
for the life of the page. Every manual `willChange` was removed before commit.

---

## 9. Sources

Framer's own documentation:

- [Scroll Transforms](https://www.framer.com/updates/scroll-transforms) — the feature announcement; confirms it is Motion underneath.
- [Transforming elements on scroll](https://www.framer.com/academy/lessons/framer-animations-scroll-transform) — the three triggers, the four properties, easing on the scroll range.
- [Mastering transitions and easing](https://www.framer.com/academy/lessons/framer-animations-transitions-and-easing) — the curve names, time-based vs physics springs.
- [Time-Based Springs](https://www.framer.com/updates/time-based-springs) — time and bounce as the default spring interface.
- [Text Effects](https://www.framer.com/academy/lessons/text-effects) and [Animating text](https://www.framer.com/academy/lessons/framer-animations-text-effects) — split modes, initial delay vs stagger delay, the triggers.
- [Using the Appear Effect](https://www.framer.com/academy/lessons/framer-animations-appear-effect) — presets and the fire-once model.
- [Framer performance](https://www.framer.com/performance/) — optimised appear animations running before JavaScript finishes loading.

Motion:

- [useTransform](https://motion.dev/docs/react-use-transform) — the `ease` option, per-segment easing arrays.
- [Easing functions](https://motion.dev/docs/easing-functions) — the shipped set, `mirrorEasing`, `reverseEasing`.
- [Transitions](https://motion.dev/docs/react-transitions) — `visualDuration`, `bounce`, and that they are overridden by stiffness/damping/mass.
- [useSpring](https://motion.dev/docs/react-use-spring) — `skipInitialAnimation`, with the scroll example.
- [Scroll animations](https://motion.dev/docs/react-scroll-animations) — native `ScrollTimeline`, pooled `IntersectionObserver`.
- [splitText](https://motion.dev/docs/split-text) — the Motion+ utility we are not using.

Read directly out of `node_modules`, because the docs do not state these:

- `motion-utils/dist/es/easing/ease.mjs` — `easeOut` is `cubicBezier(0, 0, 0.58, 1)`.
- `motion-dom/dist/es/utils/interpolate.mjs` — `if (ease)` guard, and the `noop` fallback for short ease arrays.
- `motion-dom/dist/es/value/will-change/add-will-change.mjs` — Motion skips will-change management when the value is set statically.
- `framer-motion/dist/index.d.ts` — `UseSpringOptions` includes `skipInitialAnimation`.

Technique and accessibility:

- [GSAP SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) — the split-and-revert model, and the `aria-label` advice.
- [How to accessibly split text, CSS-IRL](https://css-irl.info/how-to-accessibly-split-text/) — the same advice, and the screen-reader failure it addresses.
- [ARIA in HTML / accessible name prohibited roles](https://www.w3.org/TR/html-aria/) — why that advice does not apply to `<p>`, `<div>` or `<span>`.
- [Text mask animation, Olivier Larose](https://blog.olivierlarose.com/tutorials/text-mask-animation) — the overflow-clip plus `y: 100% → 0` line reveal in React.
- The `gsap` motion presets in the `ui-ux-pro-max` database — stagger 0.02–0.04s for long lists, no more than ~8 staggered children, and "don't split-animate long paragraphs; reserve for short headlines".
