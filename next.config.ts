import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Kontoauszüge kommen per Server-Action (Import-Vorschau). Limit in actions.ts: 5 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
