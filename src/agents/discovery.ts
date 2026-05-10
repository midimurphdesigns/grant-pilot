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
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { callLadder } from "../agent/fallback-ladder";
import { grantsSearch } from "../tools/grants-search";
import {
  firstText,
  parseJsonLoose,
  provenanceOf,
  type SubAgentEnvelope,
  type UserProfile,
} from "./types";

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

Output ONLY a JSON object with this exact shape:
{ "keyword": "<2-200 char query>", "rationale": "<short why>" }

Guidelines:
- Combine the most distinctive nouns from the user's intent with one or two profile attributes (state, industry term, ownership status if directly relevant).
- Prefer specific over broad. "rural workforce training Vermont" beats "training programs".
- Do NOT include the words "grant" or "funding" — grants.gov already filters to opportunities.
- Output JSON only. No prose, no markdown fences.`;

const RANK_SYSTEM = `You rank federal grant opportunities for fit against a stated goal and applicant profile.

Output ONLY a JSON object with this exact shape:
{ "ranked": [ { "opportunityNumber": "<id>", "score": 0-100, "rationale": "<one sentence>" }, ... ] }

Score guidelines:
- 80-100: strong fit — opportunity description aligns with intent AND applicant likely qualifies
- 50-79: plausible fit — relevant theme but eligibility uncertain or partial
- 0-49: weak fit — keyword match only, likely wrong applicant type / industry / scale

Return ALL candidates, sorted by score descending. Output JSON only. No prose, no markdown fences.`;

export async function discover(args: {
  client: Anthropic;
  intent: string;
  profile: UserProfile;
}): Promise<SubAgentEnvelope<DiscoveryResult>> {
  // Step 1 — derive the keyword query.
  const deriveLadder = await callLadder({
    client: args.client,
    systemPrompt: DERIVE_SYSTEM,
    userMessage: `Intent: ${args.intent}\n\nProfile: ${JSON.stringify(args.profile)}`,
    maxTokens: 400,
  });

  let derived: z.infer<typeof QueryDerivationSchema>;
  try {
    const parsed = parseJsonLoose<unknown>(firstText(deriveLadder.rawResponse));
    derived = QueryDerivationSchema.parse(parsed);
  } catch (err) {
    return {
      result: {
        kind: "error",
        message: `query derivation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance: provenanceOf(deriveLadder),
    };
  }

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
      result: { kind: "error", message: `grants_search ${search.error.kind}: ${"message" in search.error ? search.error.message : ""}` },
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

  const rankLadder = await callLadder({
    client: args.client,
    systemPrompt: RANK_SYSTEM,
    userMessage: `Intent: ${args.intent}\n\nProfile: ${JSON.stringify(args.profile)}\n\nCandidates:\n${JSON.stringify(candidatesForRanking, null, 2)}`,
    maxTokens: 2000,
  });

  let ranked: z.infer<typeof RankingSchema>;
  try {
    const parsed = parseJsonLoose<unknown>(firstText(rankLadder.rawResponse));
    ranked = RankingSchema.parse(parsed);
  } catch (err) {
    return {
      result: {
        kind: "error",
        message: `ranking parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance: provenanceOf(rankLadder),
    };
  }

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
