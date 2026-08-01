import type { NextConfig } from "next";

/**
 * Nothing to configure.
 *
 * `/` used to be rewritten to `public/framer/index.html`, the published Framer
 * page captured whole, because that was the fastest way to get the design in
 * front of people. The page is React now — `app/(site)` — and it serves `/`
 * itself, so both the rewrite and the 414KB capture behind it are gone, along
 * with the `/preview` address the port was built at.
 *
 * The assets the capture pulled from framerusercontent.com stay under
 * `public/assets/`: the noise tile and the corner wedge are still used, and the
 * fonts the page actually sets now come from `next/font`.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
