import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Tell Next's file-tracing where the *real* root is. Without this,
  // Vercel's "root directory: web/" setting causes the tracer to miss
  // the parent ../src/ files we import via the @grant-pilot/* alias.
  outputFileTracingRoot: resolve(__dirname, ".."),
  experimental: {},
};

export default config;
