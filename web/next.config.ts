import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * - `Strict-Transport-Security`: force HTTPS for a year (Vercel terminates
 *   TLS, but this signals browsers + crawlers to refuse downgrades).
 * - `X-Frame-Options: DENY`: this site has no legitimate iframe embeds.
 *   Belt-and-suspenders with the CSP frame-ancestors directive below for
 *   browsers that don't honor CSP.
 * - `X-Content-Type-Options: nosniff`: prevent the browser from
 *   re-interpreting served files (e.g., a .txt that contains <script>).
 * - `Referrer-Policy: strict-origin-when-cross-origin`: don't leak the
 *   current path to third parties on outbound links.
 * - `Permissions-Policy`: disable every browser API the demo doesn't use.
 *   Cheaper to enumerate the surface than to leave it open by default.
 * - `Content-Security-Policy`: 'self' for everything plus the Vercel
 *   Insights endpoint Next.js calls automatically. inline-style is needed
 *   because Tailwind/shadcn ship critical CSS as <style> blocks; inline-
 *   script is needed for the next/script-injected runtime. unsafe-eval is
 *   intentionally NOT enabled.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "sync-xhr=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Tell Next's file-tracing where the *real* root is. Without this,
  // Vercel's "root directory: web/" setting causes the tracer to miss
  // the parent ../src/ files we import via the @grant-pilot/* alias.
  outputFileTracingRoot: resolve(__dirname, ".."),
  experimental: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
