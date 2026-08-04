import type { ReactNode } from "react";

import { Reveal } from "@/components/site/reveal";

/**
 * The opener every section below the hero uses: a serif italic tag between two
 * fading hairlines, and one heading under it.
 *
 * The reference redraws the rules per section at 69×1px with a gradient to
 * transparent at the outer end. They are decoration and carry no information —
 * the tag next to them already names the section — so they are hidden from
 * assistive technology and dropped entirely on narrow screens, where 69px of
 * rule either side leaves no room for the words between them.
 *
 * ---
 *
 * **Two props that exist so the page can change rooms.** Six sections opening
 * with the same centred tag, the same centred heading and a paragraph under it
 * is a rhythm a reader stops seeing by the fourth repetition, and the fix is not
 * a second header component: it is this one able to range left, invert, and
 * carry a line of copy beside the heading instead of under it.
 *
 *   `tone`    which field the header sits on. `dark` is for a section that
 *             paints its own background, and it swaps the ink, the muted grey
 *             and the rules' gradient for the inverted tokens that already
 *             exist for cards.
 *   `aside`   one short block set beside the heading above `three:` and under
 *             it below. `MOTION_TEARDOWN.md` §5 reads the reference's density
 *             as body copy confined to a narrow right-hand column with the left
 *             kept open, and `apparatus-panels.tsx` already builds its pinned
 *             header that way; this is the same arrangement for the sections
 *             that are not pinned.
 *
 * Both default to the shape every existing caller already renders, so a section
 * that passes neither is byte-identical to what it was.
 */
export function SectionTag({
  tag,
  heading,
  align = "center",
  tone = "light",
  aside,
}: {
  tag: string;
  heading: ReactNode;
  align?: "center" | "start";
  tone?: "light" | "dark";
  /** A line of copy beside the heading. Ranged headers only; see above. */
  aside?: ReactNode;
}) {
  const centred = align === "center";
  const dark = tone === "dark";
  const ink = dark ? "#ffffff" : "var(--site-ink)";
  const muted = dark ? "var(--site-muted-invert)" : "var(--site-muted)";

  const header = (
    <>
      <Reveal>
        <span className="flex items-center gap-6">
          {centred && <Rule side="left" tone={tone} />}
          <span className="site-display" style={{ fontSize: "24px", color: muted }}>
            {tag}
          </span>
          {centred && <Rule side="right" tone={tone} />}
        </span>
      </Reveal>
      <Reveal delay={0.06}>
        <h2
          className={centred ? "mx-auto max-w-[20ch]" : "max-w-[20ch]"}
          style={{
            fontSize: "clamp(28px, 3.6vw, 48px)",
            fontWeight: 400,
            letterSpacing: "-0.04em",
            lineHeight: 1.4,
            color: ink,
          }}
        >
          {heading}
        </h2>
      </Reveal>
    </>
  );

  // The aside is a row above `three:` and a stack below it, so the heading keeps
  // its own measure on a phone rather than being squeezed into half of one.
  if (aside) {
    return (
      <header className="flex flex-col gap-6 three:flex-row three:items-end three:justify-between three:gap-16">
        <div className="flex flex-col gap-2.5">{header}</div>
        <Reveal delay={0.12} className="three:max-w-[36ch] three:shrink-0">
          {aside}
        </Reveal>
      </header>
    );
  }

  return (
    <header
      className={
        centred ? "flex flex-col items-center gap-2.5 text-center" : "flex flex-col gap-2.5"
      }
    >
      {header}
    </header>
  );
}

function Rule({ side, tone }: { side: "left" | "right"; tone: "light" | "dark" }) {
  // The stop the gradient fades from is the muted grey of its own field, taken
  // to zero alpha. Written out because a colour cannot be given an alpha in the
  // middle of a gradient without knowing its channels.
  const stops =
    tone === "dark"
      ? ["rgba(161,161,161,0)", "var(--site-muted-invert)"]
      : ["rgba(84,84,84,0)", "var(--site-muted)"];

  return (
    <span
      aria-hidden="true"
      className="hidden h-px w-[69px] shrink-0 two:block"
      style={{
        opacity: 0.5,
        background: `linear-gradient(${side === "left" ? "90deg" : "270deg"}, ${stops[0]} 0%, ${stops[1]} 100%)`,
      }}
    />
  );
}
