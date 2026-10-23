import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components off: every page reads Mongo per request anyway, and streaming
  // would make notFound() return 200 instead of a real 404.
  // OpenAPI specs can exceed the 1MB default.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
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
