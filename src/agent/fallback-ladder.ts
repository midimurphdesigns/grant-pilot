/**
 * Fallback ladder — ported from fedbench, scoped per sub-agent.
 *
 * Each sub-agent (discovery, eligibility, drafter) calls `callLadder`
 * with its own ceiling. The ladder tries Sonnet 4.6 first; on
 * rate-limit / 5xx / network failure it falls through to Haiku 4.5.
 * 4xx other than 429 surfaces as a real error — that's a bug in our
 * harness, not a provider degradation.
 *
 * Returns provenance: which rung answered, attempts that bailed, cost,
 * latency. The planner uses this to compose a transcript visitors can
 * read.
 */

import type Anthropic from "@anthropic-ai/sdk";

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

export type LadderResponse = {
  rung: LadderRung;
  rawResponse: Anthropic.Messages.Message;
  latencyMs: number;
  costUSD: number;
  attempts: { rung: string; error: string }[];
};

function shouldFallback(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (status === undefined) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function costFor(rung: LadderRung, message: Anthropic.Messages.Message): number {
  const inputCost = (message.usage.input_tokens / 1_000_000) * rung.inputUsdPerMTok;
  const outputCost = (message.usage.output_tokens / 1_000_000) * rung.outputUsdPerMTok;
  return inputCost + outputCost;
}

export type LadderCallArgs = {
  client: Anthropic;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  /** Optional tool definitions for tool-use turns. */
  tools?: Anthropic.Messages.Tool[];
};

export async function callLadder(args: LadderCallArgs): Promise<LadderResponse> {
  const attempts: { rung: string; error: string }[] = [];

  for (const rung of LADDER) {
    const startedAt = Date.now();
    try {
      const message = await args.client.messages.create({
        model: rung.model,
        max_tokens: args.maxTokens,
        system: args.systemPrompt,
        messages: [{ role: "user", content: args.userMessage }],
        ...(args.tools ? { tools: args.tools } : {}),
      });
      const latencyMs = Date.now() - startedAt;
      return {
        rung,
        rawResponse: message,
        latencyMs,
        costUSD: costFor(rung, message),
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
