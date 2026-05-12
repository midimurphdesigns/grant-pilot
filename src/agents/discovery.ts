/**
 * Discovery sub-agent.
 *
 * Given a user intent (free text) and a profile, derive a search query
 * for grants.gov, run it, and return a ranked shortlist with one-line
 * rationale per candidate. The sub-agent has its own fallback ladder
 * (Sonnet 4.6 → Haiku 4.5) — independent from the planner's ladder
 * so cost ceilings stack predictably.
 *
 * Returns at most 5 candidates. Empty searches surface as a structured
 * "no candidates" result the planner can route on (re-query with
 * loosened terms, or stop).
 *
 * Two streaming primitives used here:
 *   - `generateObject` for the cheap derive-query step (~1s, tiny
 *     output) — no value in streaming a 2-field object.
 *   - `streamObject` for the ranking step — the model emits each
 *     ranked entry one at a time, and the UI renders them as they
 *     arrive so the user sees the shortlist building instead of
 *     staring at a spinner for 4-6 seconds.
 */

import { generateObject, streamObject } from "ai";
import { z } from "zod";

import { anthropic } from "../provider";
import { callLadder, LADDER, type LadderRung } from "../agent/fallback-ladder";
import { grantsSearch } from "../tools/grants-search";
import { provenanceOf, type SubAgentEnvelope, type UserProfile } from "./types";

const QueryDerivationSchema = z.object({
  keyword: z.string().min(2).max(200),
  rationale: z.string().min(2).max(400),
});

const RankingSchema = z.object({
  ranked: z.array(
    z.object({
      opportunityNumber: z.string(),
      score: z.number().min(0).max(100),
      rationale: z.string().min(2).max(400),
    }),
  ),
});

export type DiscoveryResult =
  | {
      kind: "candidates";
      query: string;
      queryRationale: string;
      candidates: {
        opportunityNumber: string;
        title: string;
        agencyName: string | null;
        closeDate: string | null;
        score: number;
        rationale: string;
      }[];
    }
  | { kind: "empty"; query: string; queryRationale: string }
  | { kind: "error"; message: string };

/**
 * Partial discovery shape streamed to the UI. `query` + `queryRationale`
 * are settled before streaming starts (they come from the cheap
 * derive-query step). `candidates` grows item-by-item as the ranking
 * `streamObject` emits each ranked entry — title/agency/closeDate are
 * hydrated from the search response, score + rationale come from the
 * model.
 */
export type PartialDiscovery = {
  query: string;
  queryRationale: string;
  candidates: {
    opportunityNumber?: string;
    title?: string;
    agencyName?: string | null;
    closeDate?: string | null;
    score?: number;
    rationale?: string;
  }[];
};

const DERIVE_SYSTEM = `You convert a user's stated goal and business profile into a single grants.gov keyword query.

Guidelines:
- grants.gov uses a strict keyword AND-match — every term in the query must appear in the opportunity. FAVOR FEWER, BROADER TERMS over many specific ones.
- Use 2-4 words maximum. "infrastructure construction" beats "commercial infrastructure construction Arizona Phoenix small contractor".
- Drop geography (state names, ZIPs, metros) from the query — grants are filtered by applicant location at eligibility time, not in the keyword index.
- Drop size qualifiers like "small business" — most opportunities don't use that phrase verbatim.
- Drop the words "grant" and "funding" — grants.gov already filters to opportunities.
- Pick terms an agency program officer would actually write into a NOFO title or synopsis.`;

const RANK_SYSTEM = `You rank federal grant opportunities for fit against a stated goal and applicant profile.

Score guidelines:
- 80-100: strong fit — opportunity description aligns with intent AND applicant likely qualifies
- 50-79: plausible fit — relevant theme but eligibility uncertain or partial
- 0-49: weak fit — keyword match only, likely wrong applicant type / industry / scale

Return ALL candidates, sorted by score descending.`;

export async function discover(args: {
  intent: string;
  profile: UserProfile;
  /**
   * Optional callback fired as the ranking step's `streamObject` emits
   * each partial ranking. The shape mirrors `PartialDiscovery` — the
   * caller can render the shortlist filling in entry-by-entry.
   */
  onPartial?: (partial: PartialDiscovery) => void;
}): Promise<SubAgentEnvelope<DiscoveryResult>> {
  // Step 1 — derive the keyword query.
  let deriveLadder;
  try {
    deriveLadder = await callLadder(async (model) => {
      const r = await generateObject({
        model,
        schema: QueryDerivationSchema,
        system: DERIVE_SYSTEM,
        prompt: `Intent: ${args.intent}\n\nProfile: ${JSON.stringify(args.profile)}`,
        maxRetries: 2,
      });
      return {
        result: r.object,
        usage: {
          inputTokens: r.usage.promptTokens ?? 0,
          outputTokens: r.usage.completionTokens ?? 0,
        },
        finishReason: r.finishReason,
      };
    });
  } catch (err) {
    return {
      result: {
        kind: "error",
        message: `query derivation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance: {
        rung: "primary",
        model: "claude-sonnet-4-6",
        latencyMs: 0,
        costUSD: 0,
        attempts: [],
      },
    };
  }

  const derived = deriveLadder.result;

  // Step 2 — run the grants.gov search.
  const search = await grantsSearch({ keyword: derived.keyword, rows: 10 });
  if (!search.ok) {
    if (search.error.kind === "empty") {
      return {
        result: { kind: "empty", query: derived.keyword, queryRationale: derived.rationale },
        provenance: provenanceOf(deriveLadder),
      };
    }
    return {
      result: {
        kind: "error",
        message: `grants_search ${search.error.kind}: ${"message" in search.error ? search.error.message : ""}`,
      },
      provenance: provenanceOf(deriveLadder),
    };
  }

  // Step 3 — rank the candidates against the intent + profile.
  const candidatesForRanking = search.data.candidates.map((c) => ({
    opportunityNumber: c.opportunityNumber,
    title: c.title,
    agencyName: c.agencyName,
    closeDate: c.closeDate,
  }));

  // Step 3 — rank the candidates against the intent + profile.
  //
  // streamObject is used here (not generateObject) so the UI can render
  // each ranked entry as the model emits it. The candidates array on
  // PartialDiscovery grows one item at a time. Inline ladder logic
  // mirrors drafter.ts — streamObject's start→stream→finish lifecycle
  // doesn't fit callLadder's synchronous result shape.
  const byNumber = new Map(search.data.candidates.map((c) => [c.opportunityNumber, c]));
  const rankPrompt = `Intent: ${args.intent}\n\nProfile: ${JSON.stringify(args.profile)}\n\nCandidates:\n${JSON.stringify(candidatesForRanking, null, 2)}`;

  const rankAttempts: { rung: string; error: string }[] = [];
  let rankRung: LadderRung | null = null;
  let rankResult:
    | {
        ranked: { opportunityNumber: string; score: number; rationale: string }[];
        latencyMs: number;
        usage: { inputTokens: number; outputTokens: number };
        rung: LadderRung;
      }
    | null = null;

  for (const rung of LADDER) {
    rankRung = rung;
    const startedAt = Date.now();
    try {
      const model = anthropic(rung.model);
      const r = streamObject({
        model,
        schema: RankingSchema,
        system: RANK_SYSTEM,
        prompt: rankPrompt,
        maxRetries: 2,
      });

      // Pump partial ranks to the caller, hydrating title/agency from
      // the search response so the UI can render rich entries even
      // before the model has finished writing a rationale.
      if (args.onPartial) {
        for await (const partial of r.partialObjectStream) {
          const partialRanked = (partial as { ranked?: unknown }).ranked;
          const partialCandidates = Array.isArray(partialRanked)
            ? partialRanked
                .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
                .map((e) => {
                  const oppNum = typeof e.opportunityNumber === "string" ? e.opportunityNumber : undefined;
                  const c = oppNum ? byNumber.get(oppNum) : undefined;
                  return {
                    opportunityNumber: oppNum,
                    title: c?.title,
                    agencyName: c?.agencyName ?? null,
                    closeDate: c?.closeDate ?? null,
                    score: typeof e.score === "number" ? e.score : undefined,
                    rationale: typeof e.rationale === "string" ? e.rationale : undefined,
                  };
                })
            : [];
          args.onPartial({
            query: derived.keyword,
            queryRationale: derived.rationale,
            candidates: partialCandidates,
          });
        }
      } else {
        for await (const _ of r.partialObjectStream) {
          /* drain */
        }
      }

      const finalObject = await r.object;
      const usage = await r.usage;
      const latencyMs = Date.now() - startedAt;
      rankResult = {
        ranked: finalObject.ranked,
        latencyMs,
        usage: {
          inputTokens: usage.promptTokens ?? 0,
          outputTokens: usage.completionTokens ?? 0,
        },
        rung,
      };
      break;
    } catch (err) {
      rankAttempts.push({
        rung: rung.name,
        error: err instanceof Error ? err.message : String(err),
      });
      // Mirror callLadder's fallback policy: 5xx / 429 / network → fall through.
      // For other errors, surface immediately.
      const isApiCallError =
        err instanceof Error && err.name === "AI_APICallError" || err instanceof Error && err.name === "APICallError";
      if (!isApiCallError && !(err instanceof Error)) {
        break;
      }
    }
  }

  if (!rankResult) {
    return {
      result: {
        kind: "error",
        message: `ranking failed across all ladder rungs: ${JSON.stringify(rankAttempts)}`,
      },
      provenance: provenanceOf(deriveLadder),
    };
  }

  const top = rankResult.ranked
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => {
      const c = byNumber.get(r.opportunityNumber);
      return {
        opportunityNumber: r.opportunityNumber,
        title: c?.title ?? "(unknown)",
        agencyName: c?.agencyName ?? null,
        closeDate: c?.closeDate ?? null,
        score: r.score,
        rationale: r.rationale,
      };
    });

  const rankRungUsed = rankResult.rung;
  const rankCostUSD =
    (rankResult.usage.inputTokens / 1_000_000) * rankRungUsed.inputUsdPerMTok +
    (rankResult.usage.outputTokens / 1_000_000) * rankRungUsed.outputUsdPerMTok;

  return {
    result: {
      kind: "candidates",
      query: derived.keyword,
      queryRationale: derived.rationale,
      candidates: top,
    },
    // Provenance reports the more expensive of the two ladder calls
    // (ranking) — that's the dominant cost for this sub-agent.
    provenance: {
      rung: rankRungUsed.name,
      model: rankRungUsed.model,
      latencyMs: rankResult.latencyMs,
      costUSD: rankCostUSD,
      attempts: rankAttempts,
    },
  };
}
