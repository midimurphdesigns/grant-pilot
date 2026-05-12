/**
 * Per-IP rate limit — 5 runs/hour via @upstash/ratelimit.
 *
 * Rationale: a single visitor demoing the agent will run 1-3 intents
 * to see how it behaves. 5/hour leaves headroom for that without
 * unlocking script-driven hammering.
 *
 * Security posture (fail-closed):
 *
 * Per ~/.claude/rules/security.md ("Env checks must fail closed"),
 * a missing Upstash configuration in production is treated as
 * "rate limiter unavailable → refuse the request" rather than
 * "rate limiter absent → allow everything." A silently-disabled
 * rate limiter combined with an LLM-backed endpoint is a direct
 * path to unbounded API spend if credentials ever invalidate.
 *
 * Local development (NODE_ENV !== "production") still allows
 * requests through when Upstash is absent, because no real money
 * is at stake against a dev key and developers need to be able
 * to run the demo offline.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let cached: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    prefix: "grant-pilot:rl",
    analytics: false,
  });
  return cached;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  configured: boolean;
};

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const limiter = getLimiter();
  if (!limiter) {
    // Fail closed in production. In dev (no Upstash), allow.
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, resetMs: 0, configured: false };
    }
    return { allowed: true, remaining: 5, resetMs: 0, configured: false };
  }
  try {
    const r = await limiter.limit(ip);
    return {
      allowed: r.success,
      remaining: r.remaining,
      resetMs: r.reset,
      configured: true,
    };
  } catch {
    // Network/Redis failure in production → fail closed. The cost of a
    // brief outage is bounded; the cost of silently letting unlimited
    // requests through to a paid LLM is not.
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, resetMs: 0, configured: true };
    }
    return { allowed: true, remaining: 5, resetMs: 0, configured: true };
  }
}

/**
 * Resolve the client IP from incoming headers.
 *
 * Order of trust (highest → lowest):
 *
 *   1. `x-vercel-forwarded-for` — Vercel's signed header. Set by
 *      Vercel's edge before the request reaches the function. Cannot
 *      be spoofed by the client because Vercel strips any inbound
 *      version. This is the canonical IP source on Vercel.
 *   2. `x-real-ip` — also Vercel-set on its platform.
 *   3. The literal string "unknown" as a last resort.
 *
 * `x-forwarded-for` is intentionally NOT consulted. It's a comma-
 * delimited chain the client can fully control, so trusting its
 * first entry lets anyone with curl rotate their rate-limit bucket
 * by adding `X-Forwarded-For: <random>` to every request — which
 * effectively disables the rate limit for any motivated attacker.
 *
 * The trade-off: a legitimate user behind a corporate proxy whose
 * Vercel-seen IP is the proxy's IP will share the bucket with their
 * coworkers. That's the correct behavior — the limit is "demo runs
 * per egress IP," and grouping coworkers together is fine for the
 * 5-runs-per-hour ceiling.
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0];
    if (first) return first.trim();
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
