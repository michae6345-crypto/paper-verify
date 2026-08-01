# Reference teardown: datum.net

Read from the five supplied screenshots and the live site. Measurements are estimated
from screenshots, so treat ratios as approximate and the relationships as the point.

This exists to extract a system. It is not a shopping list.

## Type

Three faces doing three jobs, and the contrast between the first two is the whole idea.

- **Display: a high-contrast transitional serif.** Used at roughly 64–72px in the hero,
  40–48px at section openers. Regular weight, never bold. The contrast between thick and
  thin strokes is doing the work that weight usually does.
- **Body: a neutral geometric sans.** 17–19px, regular. Deliberately characterless. It
  carries no personality because the serif is carrying all of it.
- **Label: a monospace, uppercase, letterspaced roughly 0.1em.** 11–12px. Used only for
  eyebrows and small metadata.

The ratio between steps is close to 1.5 at the top of the scale and tightens to about
1.2 at body sizes. Hierarchy comes from size and from the serif-versus-sans switch, not
from weight. There is almost no bold anywhere.

## Spacing

Base unit reads as 8px. Within a section, elements sit 16 to 24px apart. Between
sections, 120 to 160px. That gap ratio, roughly 6:1 between outer and inner spacing, is
what makes each section feel like a separate room rather than a paragraph.

Content is centred in a container of about 1200px with generous outer margin. Text
columns cap around 60 to 68 characters.

## How a section opens

Consistently, and this is the most portable thing on the site:

```
  ◼ THE DATUM PLATFORM          <- small filled square, then mono uppercase label
  A modern edge cloud, ...      <- serif display, one accented phrase
  Why use picks and shovels...  <- sans sub-line, one sentence
```

The eyebrow is never alone and never decorative. It names the section, and the small
square marks it. Headings do not sit alone.

## Text, whitespace, imagery

Per screen, roughly 25% text, 55% empty, 20% image or shape. The emptiness is the
product. Sections are permitted to be mostly nothing.

## Where the eye lands

Size first, then isolation, then colour. The hero headline wins because it is four times
body size and has 100px of clear space under it. The accent highlight behind one phrase
is the second stop, and it works precisely because it appears once. On a page with three
highlights it would be worth nothing.

## The one thing that makes it feel considered

**Every section is a full-bleed field of a single colour, and the construction grid stays
visible across all of them.** Hairline vertical rules and small squares sit on the same
grid whether the field is white, pale green, or navy, so the page reads as one drawing
that changes colour rather than as a stack of assembled blocks.

## Shape and illustration recipe

The construction rules, not their graphics.

**Primitives.** Squares and rectangles only, axis-aligned. No arcs, no chamfers, no
isometric solids, no dot fields. Everything is a rectangle or a line.

**Fill and stroke.** Flat fills, one colour, no gradients. One exception: a single
directional colour bleed from one corner of a product image. Strokes are hairlines at
1px, thinner than the lightest type stroke on the page, so the grid recedes behind text.

**Relation to text.** Three roles, and each shape has exactly one:
1. *Behind* — an accent block sitting behind one phrase of a headline, sized to the text
   with about 4px of bleed. Highlight, not container.
2. *Beside* — the product image as a figure, in its own bordered card, never overlapping
   text.
3. *At the edge* — small squares, 8 to 24px, near section boundaries, cropped by the
   section edge, aligned to the grid.

**Placement.** On the grid, always. No rotation anywhere. Nothing is placed by eye.

**Scale.** Many small marks, no dominant hero shape. The largest element on the page is
type.

**Colour within a shape.** Monochrome. One accent, used once per section at most.

**Motion.** Static. Shapes do not respond to scroll or cursor.

**Metaphor.** Grid and field: infrastructure drawn as a plan. It does real work, because
the product is infrastructure. Borrowing the metaphor without the subject would leave
decoration.

## What not to take

Theirs specifically, and taking any of it would be recognisable:

- The palette. Navy, dusty rose, chartreuse, pale yellow-green. Also any hue-shifted
  version, which reads the same.
- The display serif and the sans. Take the pairing logic, use other faces.
- Flat silhouette figures on a dark green hill.
- Handwritten marker annotations with a curved arrow, and the founder signature.
- The copy voice. "Let's stay connected, shall we?" and "Why use picks and shovels when
  you need bulldozers and backhoes?"
- The logo, the diamond-framed icon cards, and the accent-square-plus-mono eyebrow as a
  literal lockup. We take the eyebrow *idea*, not that mark.
- Announcement bar in a pale tint at the top.

## What we take

The system underneath, restated so it survives a change of subject.

1. Three type roles, with display and body deliberately unalike, and hierarchy from size
   rather than weight.
2. A 6:1 ratio between the gap around sections and the gap inside them.
3. Every section opens with a named label above the heading. Headings never sit alone.
4. One accent gesture per section, and never two on a screen.
5. Full-bleed colour fields, with one construction grid crossing all of them.
6. Flat, axis-aligned, unrotated shapes at hairline weight, sized well below the type.
7. Whitespace as the majority of the page.
