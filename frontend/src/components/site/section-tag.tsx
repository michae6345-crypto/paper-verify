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
 */
export function SectionTag({
  tag,
  heading,
  align = "center",
}: {
  tag: string;
  heading: ReactNode;
  align?: "center" | "start";
}) {
  const centred = align === "center";
  return (
    <header className={centred ? "flex flex-col items-center gap-2.5 text-center" : "flex flex-col gap-2.5"}>
      <Reveal>
        <span className="flex items-center gap-6">
          {centred && <Rule side="left" />}
          <span className="site-display" style={{ fontSize: "24px", color: "var(--site-muted)" }}>
            {tag}
          </span>
          {centred && <Rule side="right" />}
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
            color: "var(--site-ink)",
          }}
        >
          {heading}
        </h2>
      </Reveal>
    </header>
  );
}

function Rule({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden="true"
      className="hidden h-px w-[69px] shrink-0 two:block"
      style={{
        opacity: 0.5,
        background: `linear-gradient(${side === "left" ? "90deg" : "270deg"}, rgba(84,84,84,0) 0%, var(--site-muted) 100%)`,
      }}
    />
  );
}
