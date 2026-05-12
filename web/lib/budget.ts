/**
 * Daily budget cap — Upstash Redis counter keyed by UTC date.
 *
 * Worst case under correct operation: at ~$0.10/run and $3/day cap,
 * ~30 demo runs before fallback to recording.
 *
 * Two-phase guard against concurrent overshoot:
 *
 *   1. `reserveSpend(estimateUSD)` ATOMICALLY increments the daily
 *      counter by an upper-bound estimate (currently $0.30 — covers
 *      the most expensive observed run) and returns the post-increment
 *      total. The route handler checks the returned total against the
 *      cap and refuses if it would exceed. This is the gate. Without
 *      it, a burst of concurrent requests can all observe spent < cap,
 *      all run, and collectively blow past the cap by N × cost.
 *   2. `reconcileSpend(reservedUSD, actualUSD)` adjusts the counter
 *      after the run completes by the delta (actual - reserved). For
 *      a typical run where actual ($0.10) < reserved ($0.30), this
 *      DECREMENTS the counter, freeing capacity for subsequent runs.
 *      For an overshoot (rare — only if the run somehow exceeds the
 *      reservation), it INCREMENTS.
 *
 * If the run fails before reconciliation runs (process crash, abort),
 * the reservation stays — that's the safe direction. Worst outcome:
 * temporarily over-counted spend until tomorrow's UTC rollover, which
 * means the demo serves recordings sooner than it strictly had to. No
 * money is lost; only some demo runs are.
 *
 * Fail-closed posture: in production, missing Upstash credentials make
 * the budget guard treat every request as over-cap. A silently-disabled
 * budget guard combined with an LLM-backed endpoint is a direct path to
 * unbounded spend. Dev is allowed to run without Upstash because no
 * real money is at stake against a dev key.
 */

import { Redis } from "@upstash/redis";

const CAP = Number(process.env.BUDGET_MAX_USD_PER_DAY ?? "3");

/**
 * Upper bound on the cost of a single run. Discovery + Eligibility ×
 * up to 3 candidates + Drafter under the Sonnet 4.6 rung typically
 * costs $0.07–$0.15. We reserve $0.30 to absorb the long tail (token-
 * heavy responses, ladder fallback retries). Tuned so that an estimate-
 * over-actual delta is recovered immediately via reconcileSpend rather
 * than blocking subsequent users.
 */
const PER_RUN_RESERVATION_USD = 0.3;

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

/**
 * Read-only snapshot for the UI's budget pill. Does NOT modify state —
 * use `reserveSpend` before a run when you need atomic enforcement.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const r = client();
  if (!r) {
    // Fail closed in production. In dev (no Upstash), allow.
    if (process.env.NODE_ENV === "production") {
      return {
        spentUSD: CAP,
        capUSD: CAP,
        remainingUSD: 0,
        overCap: true,
        configured: false,
      };
    }
    return {
      spentUSD: 0,
      capUSD: CAP,
      remainingUSD: CAP,
      overCap: false,
      configured: false,
    };
  }
  try {
    const raw = await r.get<string | number | null>(todayKey());
    const spent = typeof raw === "number" ? raw : raw ? Number(raw) : 0;
    return {
      spentUSD: spent,
      capUSD: CAP,
      remainingUSD: Math.max(0, CAP - spent),
      overCap: spent >= CAP,
      configured: true,
    };
  } catch {
    // Redis unreachable in production → fail closed.
    if (process.env.NODE_ENV === "production") {
      return {
        spentUSD: CAP,
        capUSD: CAP,
        remainingUSD: 0,
        overCap: true,
        configured: true,
      };
    }
    return {
      spentUSD: 0,
      capUSD: CAP,
      remainingUSD: CAP,
      overCap: false,
      configured: true,
    };
  }
}

export type ReservationResult = {
  granted: boolean;
  reservedUSD: number;
  postReservationSpentUSD: number;
  capUSD: number;
  configured: boolean;
};

/**
 * Atomically reserve an upper-bound spend amount before a run. Returns
 * whether the reservation was granted (post-increment total <= cap)
 * and the post-increment running total.
 *
 * The route MUST call this before executing the agent, and MUST call
 * `reconcileSpend` after the run completes (or fails) so the reserved
 * amount gets adjusted to the actual cost.
 */
export async function reserveSpend(): Promise<ReservationResult> {
  const r = client();
  if (!r) {
    if (process.env.NODE_ENV === "production") {
      return {
        granted: false,
        reservedUSD: 0,
        postReservationSpentUSD: CAP,
        capUSD: CAP,
        configured: false,
      };
    }
    return {
      granted: true,
      reservedUSD: 0,
      postReservationSpentUSD: 0,
      capUSD: CAP,
      configured: false,
    };
  }
  try {
    const key = todayKey();
    // Upstash INCRBYFLOAT is atomic at the Redis level. Concurrent
    // callers serialize on this single command, so no two requests
    // can both observe a sub-cap counter and both proceed.
    const post = await r.incrbyfloat(key, PER_RUN_RESERVATION_USD);
    await r.expire(key, 60 * 60 * 36);
    const total = typeof post === "number" ? post : Number(post);
    if (total > CAP) {
      // Over the cap — refund the reservation so the counter doesn't
      // drift upward on every refused request.
      await r.incrbyfloat(key, -PER_RUN_RESERVATION_USD);
      return {
        granted: false,
        reservedUSD: 0,
        postReservationSpentUSD: total - PER_RUN_RESERVATION_USD,
        capUSD: CAP,
        configured: true,
      };
    }
    return {
      granted: true,
      reservedUSD: PER_RUN_RESERVATION_USD,
      postReservationSpentUSD: total,
      capUSD: CAP,
      configured: true,
    };
  } catch {
    // Redis unreachable in production → fail closed.
    if (process.env.NODE_ENV === "production") {
      return {
        granted: false,
        reservedUSD: 0,
        postReservationSpentUSD: CAP,
        capUSD: CAP,
        configured: true,
      };
    }
    return {
      granted: true,
      reservedUSD: 0,
      postReservationSpentUSD: 0,
      capUSD: CAP,
      configured: true,
    };
  }
}

/**
 * Adjust the daily counter by the delta between the reserved amount
 * and the actual cost. Should be called once per `reserveSpend` after
 * the run completes (or on the error path, with `actualUSD = 0`).
 */
export async function reconcileSpend(reservedUSD: number, actualUSD: number): Promise<void> {
  if (reservedUSD === 0) return;
  const r = client();
  if (!r) return;
  const delta = actualUSD - reservedUSD;
  if (delta === 0) return;
  try {
    const key = todayKey();
    await r.incrbyfloat(key, delta);
    await r.expire(key, 60 * 60 * 36);
  } catch {
    // Reconciliation failure is non-fatal — the reservation stays.
    // Worst case: temporarily over-counted until tomorrow's rollover.
  }
}
