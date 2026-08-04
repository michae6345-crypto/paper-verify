import type { Metadata } from "next";

import { DemoForm } from "@/components/demo/demo-form";
import { DemoRail } from "@/components/demo/demo-rail";
import { Container } from "@/components/site/ui";

/**
 * `/demo` — the front door.
 *
 * Two columns above 1100px: what a demo is on the left, the form on the right.
 * One column below it, in that order, so a phone reads the argument before it
 * is asked for anything.
 *
 * The measure is 1160 rather than the landing page's 1440. This is a form and a
 * short piece of prose, and neither wants to be 700px wide.
 */

export const metadata: Metadata = {
  title: "residual: book a demo",
  description:
    "Ask for a walkthrough of residual on a paper you choose. The form records your request in this browser and sends nothing yet.",
};

export default function DemoPage() {
  return (
    <Container className="pt-10 pb-20 two:pt-16 two:pb-28">
      <div
        className="mx-auto grid w-full max-w-[1160px] gap-10 three:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] three:gap-16"
      >
        {/* A plain wrapper, and it earns its place: the grid stretches its items
            to the row height, which is what gives the sticky rail inside it room
            to travel. Put `sticky` on the item itself and it has nothing to move
            within. */}
        <div>
          <DemoRail />
        </div>

        <div>
          <DemoForm />
        </div>
      </div>
    </Container>
  );
}
