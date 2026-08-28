import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Electron packaging
  // This produces a self-contained .next/standalone directory
  output: "standalone",
};

export default nextConfig;
