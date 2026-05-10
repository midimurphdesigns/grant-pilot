/**
 * Drafter sub-agent.
 *
 * Given a target grant and a user profile, produce a structured draft
 * skeleton — section headings + 1-3 sentence prompts under each — that
 * the applicant can flesh out. Deliberately NOT a full prose draft;
 * grant applications require human voice and verifiable claims, so we
 * produce scaffolding only.
 *
 * Sections are derived from the grant's stated submission structure
 * when available, or fall back to a standard federal grant skeleton
 * (need / approach / capability / budget / outcomes).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { callLadder } from "../agent/fallback-ladder";
import { grantDetail } from "../tools/grant-detail";
import {
  firstText,
  parseJsonLoose,
  provenanceOf,
  type SubAgentEnvelope,
  type UserProfile,
} from "./types";

const SectionSchema = z.object({
  heading: z.string().min(2).max(120),
  guidance: z.string().min(2).max(800),
  promptsForApplicant: z.array(z.string().min(2).max(400)).min(1).max(6),
});

const DraftSchema = z.object({
  summary: z.string().min(10).max(800),
  sections: z.array(SectionSchema).min(3).max(8),
  watchOuts: z.array(z.string().min(2).max(400)).default([]),
});

export type DrafterResult =
  | {
      kind: "draft";
      opportunityNumber: string;
      title: string;
      summary: string;
      sections: {
        heading: string;
        guidance: string;
        promptsForApplicant: string[];
      }[];
      watchOuts: string[];
    }
  | { kind: "error"; message: string };

const SYSTEM = `You produce a structured draft skeleton for a federal grant application — section headings with guidance and prompts the applicant must answer. You do NOT write the prose itself.

Output ONLY a JSON object with this exact shape:
{
  "summary": "<2-3 sentence framing of the proposal angle that fits this applicant + grant>",
  "sections": [
    {
      "heading": "<section name>",
      "guidance": "<what this section needs to demonstrate, grounded in the grant's stated requirements>",
      "promptsForApplicant": [ "<question the applicant must answer>", ... ]
    },
    ...
  ],
  "watchOuts": [ "<common pitfalls specific to this opportunity>", ... ]
}

Guidelines:
- Derive sections from the grant's stated submission structure when present in the description. Otherwise use: Statement of Need, Project Approach, Organizational Capability, Budget Narrative, Outcomes & Evaluation.
- Each prompt should be a specific question, not a generic instruction.
- "watchOuts" should reflect the eligibility text — disqualifiers a careless applicant could trip over.
- Output JSON only. No prose, no markdown fences.`;

export async function draft(args: {
  client: Anthropic;
  profile: UserProfile;
  opportunityNumber: string;
}): Promise<SubAgentEnvelope<DrafterResult>> {
  const detail = await grantDetail({ opportunityNumber: args.opportunityNumber });
  if (!detail.ok) {
    return {
      result: {
        kind: "error",
        message: `grant_detail ${detail.error.kind}: ${"message" in detail.error ? detail.error.message : ""}`,
      },
      provenance: { rung: "n/a", model: "n/a", latencyMs: 0, costUSD: 0, attempts: [] },
    };
  }

  const userMessage = [
    `Applicant profile: ${JSON.stringify(args.profile)}`,
    "",
    `Opportunity: ${detail.data.title} (${detail.data.opportunityNumber})`,
    `Agency: ${detail.data.agencyName ?? "unknown"}`,
    `Funding range: $${detail.data.fundingFloorUSD ?? "?"} - $${detail.data.fundingCeilingUSD ?? "?"}`,
    `Number of awards: ${detail.data.awardCount ?? "?"}`,
    `Close date: ${detail.data.closeDate ?? "?"}`,
    "",
    "Description:",
    detail.data.description ?? "(none)",
    "",
    "Eligibility text:",
    detail.data.eligibilityText ?? "(none)",
  ].join("\n");

  const ladder = await callLadder({
    client: args.client,
    systemPrompt: SYSTEM,
    userMessage,
    maxTokens: 3000,
  });

  let parsed: z.infer<typeof DraftSchema>;
  try {
    const raw = parseJsonLoose<unknown>(firstText(ladder.rawResponse));
    parsed = DraftSchema.parse(raw);
  } catch (err) {
    return {
      result: {
        kind: "error",
        message: `draft parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance: provenanceOf(ladder),
    };
  }

  return {
    result: {
      kind: "draft",
      opportunityNumber: detail.data.opportunityNumber,
      title: detail.data.title,
      summary: parsed.summary,
      sections: parsed.sections,
      watchOuts: parsed.watchOuts,
    },
    provenance: provenanceOf(ladder),
  };
}
