import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      /**
       * Serve the Framer landing page at `/`.
       *
       * `public/framer/index.html` is the published Framer site, captured whole.
       * Framer inlines its own CSS and scripts, so the file is the page: serving
       * it is identical to what Framer serves, which hand-porting it to React
       * would never be.
       *
       * `beforeFiles` because the `(site)` route group also claims `/`. This
       * rewrite wins, and that route group stays in the repo unused rather than
       * being deleted, so the React version is still there if we want it back.
       *
       * The app's own routes are untouched: `/check`, `/reports/[id]` and
       * `/runs/[id]` are not matched here and keep the dark chrome.
       */
      beforeFiles: [{ source: "/", destination: "/framer/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
