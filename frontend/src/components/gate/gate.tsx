"use client";

import { useId, type ReactNode } from "react";

import { GATE_KEY } from "@/components/gate/gate-store";
import { useGateUnlocked } from "@/components/gate/use-gate";

/**
 * The guard. Wrap a route's layout in it and the route is behind the curtain.
 *
 *     export default function DashboardLayout({ children }) {
 *       return <Gate>{children}</Gate>;
 *     }
 *
 * Outermost, above the route's own chrome, on purpose: a locked visitor should
 * get the surface a missing route gets, and a missing route has no header, no
 * nav and no footer. Wrapping *inside* the chrome would frame the quiet 404 in
 * the product's furniture, which is a tell.
 *
 * **What it does and does not do.** It decides what is painted. It does not
 * decide what is served: `children` is rendered on the server whichever branch
 * this takes, so the gated page is in the RSC payload of the response a locked
 * visitor receives, and it is in the JavaScript bundle they download. This is a
 * curtain, and `gate-store.ts` says at length what may and may not be put behind
 * one. Nothing that has to be withheld can be withheld here.
 */
export function Gate({ children }: { children: ReactNode }) {
  const unlocked = useGateUnlocked();

  // The whole verdict. `useGateUnlocked` reads `false` on the server and on the
  // first client render, so a locked visitor and the server agree and the
  // protected page is never constructed for them; an unlocked reader's swap
  // happens in a layout effect, inside the same commit, before paint.
  if (unlocked) return <>{children}</>;

  return <QuietNotFound />;
}

/**
 * What a locked visitor gets.
 *
 * Byte for byte what this build serves for a URL that genuinely does not exist:
 * `next/dist/client/components/http-access-fallback/error-fallback.js`, the
 * built-in 404, reproduced rather than imported because it is an internal module
 * with no public entry point. If it drifts, the two stop matching and the tell
 * is that `/check` looks *slightly* unlike a real dead link — so the thing to
 * check on a Next upgrade is that file.
 *
 * It is deliberately not a sign-in screen, not a "you do not have access" page,
 * and not a redirect to somewhere that mentions a secret. A door you can see is
 * not a secret door; a visitor who finds nothing at `/check` has learned that
 * there is nothing at `/check`.
 *
 * **Two things still give it away, and neither is fixable from this file.**
 * Measured in a browser, not reasoned about; `scripts/check-gate.mjs` prints
 * both on every run so they cannot rot quietly.
 *
 *   The status code. A locked route answers `200`, a missing one answers `404`.
 *   The server cannot tell the difference, because the secret is in
 *   `localStorage` and the server never sees it. Closing this means a cookie and
 *   a `proxy.ts` — Next 16's new name for middleware — and a cookie the client
 *   sets is no more of a secret than this is. It would buy an accurate status
 *   code, not any actual withholding.
 *
 *   The tab title on `/submit` and `/account`. Those two pages export their own
 *   `metadata`, which wins over anything a layout says, so the tab reads "Submit
 *   a paper" over a 404 body. `/check` happens to match because its title falls
 *   back to the root's, which is also what a genuinely missing route shows. The
 *   fix belongs in those two pages, which this workstream does not own.
 *
 * There is deliberately no `<title>` rendered here. One was tried: it is dead
 * weight, because Next's metadata emits its own earlier in the document and the
 * first title wins, and it is worse than dead weight if that order ever changes
 * — a locked page announcing "404: This page could not be found." while a real
 * missing route says "residual" is a tell in the other direction.
 */
function QuietNotFound() {
  const id = useId();

  return (
    <>
      <div id={id} style={styles.error} suppressHydrationWarning>
        <div>
          <style
            // Next's own 404 sets these on `body`, and matching it is the point.
            dangerouslySetInnerHTML={{
              __html:
                "body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}",
            }}
          />
          <h1 className="next-error-h1" style={styles.h1}>
            404
          </h1>
          <div style={styles.desc}>
            <h2 style={styles.h2}>This page could not be found.</h2>
          </div>
        </div>
      </div>
      <PrePaintHint id={id} />
    </>
  );
}

/**
 * The half-frame `useLayoutEffect` cannot reach.
 *
 * Next's "How to prevent flash before hydration" guide is explicit about the
 * limit: a layout effect runs before paint but *after hydration*, and on a slow
 * connection the browser paints the server's HTML before React has loaded. The
 * server's HTML here is the 404. So without this, the one reader who is supposed
 * to be through the curtain is the one who watches a 404 sit there while the
 * bundle downloads.
 *
 * An inline script runs during parsing, before React is involved, so it is the
 * only thing that can. It hides the element that precedes it — the guide's own
 * shape, and why that element carries `suppressHydrationWarning`: the DOM now
 * disagrees with what React is about to render, and React should keep the DOM.
 * A moment later the layout effect unmounts the element outright.
 *
 * It reads storage with exactly the test `isGateUnlocked` applies, so the two
 * cannot disagree and leave a locked visitor staring at a blank page. If storage
 * throws, it does nothing and the 404 stands, which is the safe direction.
 *
 * On a client-side navigation this never runs — React does not execute scripts
 * it inserts, and the `text/plain` type below makes that explicit rather than
 * accidental — and it does not need to, because there is no server paint to
 * correct. The layout effect has the whole job on that path.
 *
 * The one case it does not cover: an unlocked reader whose JavaScript never
 * arrives sees a blank page rather than a 404. They have no working app either
 * way, and hiding a wrong answer beats painting one.
 */
function PrePaintHint({ id }: { id: string }) {
  const html =
    `{try{var v=localStorage.getItem(${JSON.stringify(GATE_KEY)});` +
    `var o=v?JSON.parse(v):null;` +
    `if(o&&typeof o.unlockedAt==="string"){` +
    `var n=document.getElementById(${JSON.stringify(id)});if(n)n.style.display="none"}}catch(e){}}`;

  return (
    <script
      // React warns in development about rendering `<script>`, and a script
      // React re-inserted on a soft navigation would not execute anyway. The
      // guide's helper: live on the server, inert on the client.
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Lifted from `next/dist/client/components/styles/access-error-styles.js`. */
const styles = {
  error: {
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: "100vh",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  desc: {
    display: "inline-block",
  },
  h1: {
    display: "inline-block",
    margin: "0 20px 0 0",
    padding: "0 23px 0 0",
    fontSize: 24,
    fontWeight: 500,
    verticalAlign: "top",
    lineHeight: "49px",
  },
  h2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "49px",
    margin: 0,
  },
} satisfies Record<string, React.CSSProperties>;
