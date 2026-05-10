import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The Route Handler streams transcript steps as they complete.
  // Edge runtime would be lighter, but the Anthropic SDK pulls in
  // node-only deps (path, fs in the streaming reader); keep nodejs.
  experimental: {},
};

export default config;
