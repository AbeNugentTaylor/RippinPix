import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // /configurator (dev-only, 404s in production) previews arbitrary local
    // photos through /api/local-image?path=..., which next/image otherwise
    // rejects as an unconfigured local pathname+query combination.
    localPatterns: [{ pathname: "/api/local-image" }],
  },
};

export default nextConfig;
