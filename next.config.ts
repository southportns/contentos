import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Electron packaging
  // This produces a self-contained .next/standalone directory
  output: "standalone",
  // Override the default 30s proxy timeout in development mode.
  // Long-running API routes (ASR transcript, content search) can take 60-300s.
  experimental: {
    proxyTimeout: 300_000, // 5 minutes
  },
};

export default nextConfig;
