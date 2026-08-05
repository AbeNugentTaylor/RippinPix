import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Configuring `localPatterns` at all makes it an exclusive allowlist for
    // *every* local next/image src, not just the pattern being added — so
    // the real site's own /photos/<design>/<file> card images need their own
    // entry here too, or they 404 the same way /api/local-image did before
    // this file existed.
    localPatterns: [
      { pathname: "/photos/**" },
      // /configurator (dev-only, 404s in production) previews arbitrary
      // local photos through /api/local-image?path=..., which next/image
      // otherwise rejects as an unconfigured local pathname+query combination.
      { pathname: "/api/local-image" },
    ],
  },
};

export default nextConfig;
