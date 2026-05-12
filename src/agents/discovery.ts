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
 * Uses the AI SDK's `generateObject` for structured output: the Zod
 * schema constrains the model's response, the SDK validates + retries
 * on schema failure, and we drop the old hand-rolled JSON parsing.
 */

import { generateObject } from "ai";
import { z } from "zod";

import { callLadder } from "../agent/fallback-ladder";
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

  let rankLadder;
  try {
    rankLadder = await callLadder(async (model) => {
      const r = await generateObject({
        model,
        schema: RankingSchema,
        system: RANK_SYSTEM,
        prompt: `Intent: ${args.intent}\n\nProfile: ${JSON.stringify(args.profile)}\n\nCandidates:\n${JSON.stringify(candidatesForRanking, null, 2)}`,
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
        message: `ranking parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance: provenanceOf(deriveLadder),
    };
  }

  const ranked = rankLadder.result;

  const byNumber = new Map(search.data.candidates.map((c) => [c.opportunityNumber, c]));
  const top = ranked.ranked
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

  return {
    result: {
      kind: "candidates",
      query: derived.keyword,
      queryRationale: derived.rationale,
      candidates: top,
    },
    // Provenance reports the more expensive of the two ladder calls
    // (ranking) — that's the dominant cost for this sub-agent.
    provenance: provenanceOf(rankLadder),
  };
}
