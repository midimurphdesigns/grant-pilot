/**
 * Daily budget cap — Upstash Redis counter keyed by UTC date.
 *
 * Worst case: at $0.07/run and $3/day cap, ~42 demo runs before
 * fallback to recording. Counter increments AFTER a run completes
 * so a partial failure doesn't burn quota.
 */

import { Redis } from "@upstash/redis";

const CAP = Number(process.env.BUDGET_MAX_USD_PER_DAY ?? "3");

function todayKey(): string {
  const d = new Date();
  return `budget:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function client(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export type BudgetStatus = {
  spentUSD: number;
  capUSD: number;
  remainingUSD: number;
  overCap: boolean;
  configured: boolean;
};

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const r = client();
  if (!r) {
    return { spentUSD: 0, capUSD: CAP, remainingUSD: CAP, overCap: false, configured: false };
  }
  const raw = await r.get<string | number | null>(todayKey());
  const spent = typeof raw === "number" ? raw : raw ? Number(raw) : 0;
  return {
    spentUSD: spent,
    capUSD: CAP,
    remainingUSD: Math.max(0, CAP - spent),
    overCap: spent >= CAP,
    configured: true,
  };
}

export async function recordSpend(amountUSD: number): Promise<void> {
  const r = client();
  if (!r) return;
  // INCRBYFLOAT keeps the running total. Set 36-hour TTL so old keys
  // expire automatically (longer than 24h to handle UTC drift).
  await r.incrbyfloat(todayKey(), amountUSD);
  await r.expire(todayKey(), 60 * 60 * 36);
}
