/**
 * Fallback ladder — Sonnet 4.6 primary, Haiku 4.5 fallback.
 *
 * Each sub-agent calls `callLadder` with an SDK-level invocation
 * (`generateText`, `generateObject`, etc.) parametric on the chosen
 * rung's model. The ladder owns:
 *
 *   - retry-on-overloaded policy (5xx / 429 / network → fall through)
 *   - cost calculation from the AI SDK's `usage` token counts
 *   - provenance bookkeeping (rung, latency, attempts)
 *
 * 4xx errors other than 429 surface as real errors — they signal a
 * harness bug, not a provider degradation.
 *
 * Sub-agents stay in control of WHICH AI SDK primitive to use
 * (generateText, generateObject, streamText). The ladder only owns
 * the fallback POLICY.
 */

import { APICallError } from "ai";

import { anthropic } from "../provider";

export type LadderRung = {
  name: string;
  model: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  latencyBudgetMs: number;
  description: string;
};

export const LADDER: readonly LadderRung[] = [
  {
    name: "primary",
    model: "claude-sonnet-4-6",
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
    latencyBudgetMs: 5000,
    description:
      "Strongest reasoning at moderate cost. Default for planner + sub-agents unless rate-limited.",
  },
  {
    name: "fallback",
    model: "claude-haiku-4-5",
    inputUsdPerMTok: 1,
    outputUsdPerMTok: 5,
    latencyBudgetMs: 2500,
    description:
      "5x cheaper, ~2x faster. Acceptable when retrieved evidence is unambiguous; flag close calls for sample audit.",
  },
] as const;

/**
 * Token usage as returned by AI SDK's `usage` object. We accept any
 * shape that has input/output counts — different SDK functions
 * sometimes use different field names (inputTokens vs promptTokens).
 */
export type LadderUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LadderResponse<T> = {
  result: T;
  rung: LadderRung;
  usage: LadderUsage;
  finishReason: string | undefined;
  latencyMs: number;
  costUSD: number;
  attempts: { rung: string; error: string }[];
};

/**
 * The caller provides a function that takes a `LanguageModel` (the AI
 * SDK's standard model interface, produced by `anthropic(modelId)`)
 * and returns a result + token usage. The ladder calls it once per
 * rung until one succeeds or all fail.
 *
 * Returning `usage` alongside the result is how the ladder calculates
 * cost — AI SDK's `generateText` / `generateObject` / `streamText`
 * all expose `usage.inputTokens` + `usage.outputTokens` on their
 * results. Callers must thread that through.
 */
export type LadderCall<T> = (
  model: ReturnType<typeof anthropic>,
  rung: LadderRung,
) => Promise<{ result: T; usage: LadderUsage; finishReason?: string }>;

function shouldFallback(err: unknown): boolean {
  if (err instanceof APICallError) {
    const status = err.statusCode;
    if (status === undefined) return true;
    if (status === 429) return true;
    if (status >= 500) return true;
    return false;
  }
  // Non-APICallError errors (network failure, abort, etc.) — fall through.
  return err instanceof Error;
}

function costFor(rung: LadderRung, usage: LadderUsage): number {
  const inputCost = (usage.inputTokens / 1_000_000) * rung.inputUsdPerMTok;
  const outputCost = (usage.outputTokens / 1_000_000) * rung.outputUsdPerMTok;
  return inputCost + outputCost;
}

/**
 * Run a callable against successive ladder rungs until one succeeds.
 * Returns the result plus full provenance (rung, cost, latency,
 * attempts that bailed).
 *
 * Usage example (from a sub-agent):
 *
 *   const ladder = await callLadder(async (model, _rung) => {
 *     const r = await generateObject({
 *       model,
 *       schema: MySchema,
 *       system: "...",
 *       prompt: "...",
 *       maxRetries: 2,
 *     });
 *     return {
 *       result: r.object,
 *       usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens },
 *       finishReason: r.finishReason,
 *     };
 *   });
 */
export async function callLadder<T>(call: LadderCall<T>): Promise<LadderResponse<T>> {
  const attempts: { rung: string; error: string }[] = [];

  for (const rung of LADDER) {
    const model = anthropic(rung.model);
    const startedAt = Date.now();
    try {
      const { result, usage, finishReason } = await call(model, rung);
      const latencyMs = Date.now() - startedAt;
      return {
        result,
        rung,
        usage,
        finishReason,
        latencyMs,
        costUSD: costFor(rung, usage),
        attempts,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      attempts.push({ rung: rung.name, error: errMsg });
      if (!shouldFallback(err)) throw err;
    }
  }

  throw new Error(
    `all ladder rungs exhausted; attempts: ${JSON.stringify(attempts)}`,
  );
}
