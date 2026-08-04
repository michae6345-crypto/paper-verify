"use client";

import { useEffect, useState } from "react";

import {
  MOTION_EVENT,
  readMotionPreference,
  writeMotionPreference,
  type MotionPreference,
} from "@/components/site/motion/scrub";

/**
 * A small control that decides whether this page animates.
 *
 * It exists because `prefers-reduced-motion` conflates two readers. On Windows
 * the query is driven by Settings > Accessibility > Visual effects > Animation
 * effects, and that switch is very widely used as a *performance* tweak on
 * modest hardware. So a machine can report `reduce` while its owner has no idea
 * the setting reaches the web at all, and this page is entirely scroll-driven —
 * honouring the query correctly means such a reader sees a still page and
 * concludes the site is broken.
 *
 * The answer is not to override the preference. It is to ask.
 *
 * **Three deliberate refusals**, because each is a way this could have gone
 * wrong:
 *
 *   It never prompts. No banner, no first-visit nudge, no toast. A reader who
 *   needs a still page should never have to defend that choice to a website.
 *
 *   It never changes the default. `system` stays `system` until a person
 *   presses this, so nothing here weakens the accessibility behaviour for
 *   anyone who has not asked.
 *
 *   It does not hide when the system already allows motion. The `off` state has
 *   to be reachable by a reader whose OS says nothing, which is most of them,
 *   and a control that only appears once you already have a problem is a
 *   control nobody finds.
 *
 * Three radio inputs rather than a switch, because the state is genuinely
 * ternary and "follow the system" is not the midpoint between on and off. Radios
 * also give arrow-key selection and a group label for free, which a pile of
 * buttons would have to reimplement.
 */

const OPTIONS: { value: MotionPreference; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow this device's motion setting" },
  { value: "full", label: "On", hint: "Animate even if this device asks for less motion" },
  { value: "off", label: "Off", hint: "Never animate" },
];

export function MotionControl({ tone = "dark" }: { tone?: "light" | "dark" }) {
  // `system` on the server and on the first client render, matching the gate.
  // The stored value arrives in an effect; see `useReducedMotionGate` for why
  // any other first value would cost the subtree its server markup.
  const [preference, setPreference] = useState<MotionPreference>("system");

  useEffect(() => {
    const sync = () => setPreference(readMotionPreference());
    sync();
    window.addEventListener(MOTION_EVENT, sync);
    // `storage` is the other-tab case. Without it, changing the preference in
    // one tab leaves a second tab's control showing the old answer.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MOTION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const choose = (next: MotionPreference) => {
    setPreference(next);
    writeMotionPreference(next);
  };

  const dark = tone === "dark";
  const ink = dark ? "#ffffff" : "var(--site-ink)";
  const quiet = dark ? "var(--site-muted-invert)" : "var(--site-muted)";
  const line = dark ? "var(--site-line-invert)" : "var(--site-line)";

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend style={{ fontSize: "13px", color: quiet }}>Motion</legend>

      <div
        className="inline-flex items-center gap-1 p-1"
        style={{ border: `1px solid ${line}`, borderRadius: "var(--site-radius-pill)" }}
      >
        {OPTIONS.map((option) => {
          const on = preference === option.value;
          return (
            <label
              key={option.value}
              title={option.hint}
              className="cursor-pointer px-3 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
              style={{
                background: on ? (dark ? "rgba(255,255,255,0.12)" : "var(--site-card)") : "transparent",
                borderRadius: "var(--site-radius-pill)",
                color: on ? ink : quiet,
                fontSize: "13px",
              }}
            >
              <input
                type="radio"
                name="residual-motion"
                value={option.value}
                checked={on}
                onChange={() => choose(option.value)}
                className="sr-only"
              />
              {option.label}
              <span className="sr-only">. {option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
