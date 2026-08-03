import { Fragment_Mono, Instrument_Serif, Inter } from "next/font/google";

/**
 * The application's typefaces, which are the landing page's typefaces.
 *
 * `app/layout.tsx` loads §3's original three (Instrument Sans / Source Serif 4 /
 * IBM Plex Mono) onto `<html>`. This module redefines two of those three CSS
 * variables further down the tree, on the root element of each app page, so
 * every existing `t-body` / `t-num` / `t-label` in the app picks up the new face
 * without a single component knowing about it.
 *
 * Which two, and why not the third:
 *
 *   --font-ui       Instrument Sans → Inter. The landing's body face.
 *   --font-numeric  IBM Plex Mono → Fragment Mono. The landing's numerals, and
 *                   the reason every number in the product now looks the same.
 *   --font-doc      Source Serif 4, UNCHANGED. Instrument Serif is a display
 *                   face: no bold, and a stroke contrast that falls apart at
 *                   17px/1.65 over a paragraph. The document pane is the one
 *                   surface in the product that is read rather than scanned, so
 *                   it keeps a reading face. The landing sets its running text
 *                   in Inter for exactly the same reason and uses Instrument
 *                   Serif only where it is large.
 *
 * --font-display is new, and it is Instrument Serif in the size range the
 * landing uses it in: page and section headings, never a paragraph.
 */

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  variable: "--font-numeric",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Put this on the root element of an app page. It is a `className`, not a
 * provider: next/font emits the variables as a class, so the override is scoped
 * to the subtree it is applied to and the marketing route group — which loads
 * the same three faces under its own `--font-site-*` names — is untouched.
 */
export const appFonts = `${inter.variable} ${fragmentMono.variable} ${instrumentSerif.variable}`;
