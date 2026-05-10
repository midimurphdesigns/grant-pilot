/**
 * Per-IP rate limit — 5 runs/hour via @upstash/ratelimit.
 *
 * Rationale: a single visitor demoing the agent will run 1-3 intents
 * to see how it behaves. 5/hour leaves headroom for that without
 * unlocking script-driven hammering.
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
    return { allowed: true, remaining: 5, resetMs: 0, configured: false };
  }
  const r = await limiter.limit(ip);
  return {
    allowed: r.success,
    remaining: r.remaining,
    resetMs: r.reset,
    configured: true,
  };
}

export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    if (first) return first.trim();
  }
  return headers.get("x-real-ip") ?? "unknown";
}
