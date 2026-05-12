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
 *
 * Uses the AI SDK's `streamObject` for progressive structured output:
 * the Zod DraftSchema constrains the model's response AND the partial-
 * object stream gets exposed to the caller so the UI can render the
 * sections incrementally as they generate. This is the only sub-agent
 * that streams; Discovery + Eligibility use the cheaper non-streaming
 * `generateObject`.
 */

import { streamObject } from "ai";
import { z } from "zod";

import { anthropic } from "../provider";
import { LADDER, type LadderRung } from "../agent/fallback-ladder";
import { grantDetail } from "../tools/grant-detail";
import { type SubAgentEnvelope, type UserProfile } from "./types";

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

/**
 * Partial draft shape as it streams in. Section count grows as the
 * model emits each section. The route handler can forward these to
 * the client over NDJSON so the UI renders progressively.
 */
export type PartialDraft = {
  summary?: string;
  sections?: {
    heading?: string;
    guidance?: string;
    promptsForApplicant?: string[];
  }[];
  watchOuts?: string[];
};

const SYSTEM = `You produce a structured draft skeleton for a federal grant application — section headings with guidance and prompts the applicant must answer. You do NOT write the prose itself.

Guidelines:
- Derive sections from the grant's stated submission structure when present in the description. Otherwise use: Statement of Need, Project Approach, Organizational Capability, Budget Narrative, Outcomes & Evaluation.
- Each prompt should be a specific question, not a generic instruction.
- "watchOuts" should reflect the eligibility text — disqualifiers a careless applicant could trip over.`;

/**
 * Run drafter with optional progressive callback. Each call to
 * onPartial receives the in-flight DraftSchema partial — undefined
 * fields where the model hasn't emitted yet, sections array growing
 * as new sections start streaming.
 */
export async function draft(args: {
  profile: UserProfile;
  opportunityNumber: string;
  onPartial?: (partial: PartialDraft) => void;
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

  // Drafter uses streamObject so the UI can render sections progressively.
  // We can't share the ladder helper here because streamObject's lifecycle
  // (start → stream partials → finish) doesn't fit the synchronous
  // request/response shape callLadder expects. So we inline the ladder
  // logic for this one sub-agent.
  const attempts: { rung: string; error: string }[] = [];
  let lastRung: LadderRung | null = null;

  for (const rung of LADDER) {
    lastRung = rung;
    const startedAt = Date.now();
    try {
      const model = anthropic(rung.model);
      const r = streamObject({
        model,
        schema: DraftSchema,
        system: SYSTEM,
        prompt: userMessage,
        maxRetries: 2,
      });

      // Pump partial-object updates to the caller as they arrive.
      // `r.partialObjectStream` is an AsyncIterable<DeepPartial<schema>>.
      if (args.onPartial) {
        for await (const partial of r.partialObjectStream) {
          args.onPartial(partial as PartialDraft);
        }
      } else {
        // Even without a callback we need to drain the stream so the
        // final usage + object resolve.
        for await (const _ of r.partialObjectStream) {
          /* drain */
        }
      }

      const finalObject = await r.object;
      const usage = await r.usage;
      const latencyMs = Date.now() - startedAt;
      const inputTokens = usage.promptTokens ?? 0;
      const outputTokens = usage.completionTokens ?? 0;
      const costUSD =
        (inputTokens / 1_000_000) * rung.inputUsdPerMTok +
        (outputTokens / 1_000_000) * rung.outputUsdPerMTok;

      return {
        result: {
          kind: "draft",
          opportunityNumber: detail.data.opportunityNumber,
          title: detail.data.title,
          summary: finalObject.summary,
          sections: finalObject.sections,
          watchOuts: finalObject.watchOuts,
        },
        provenance: {
          rung: rung.name,
          model: rung.model,
          latencyMs,
          costUSD,
          attempts,
        },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      attempts.push({ rung: rung.name, error: errMsg });
      // Fall through to next rung. (We don't distinguish overloaded vs
      // schema-validation failure here because the schema retry already
      // happens inside streamObject via maxRetries.)
    }
  }

  return {
    result: {
      kind: "error",
      message: `draft generation failed across all ladder rungs: ${JSON.stringify(attempts)}`,
    },
    provenance: {
      rung: lastRung?.name ?? "primary",
      model: lastRung?.model ?? "claude-sonnet-4-6",
      latencyMs: 0,
      costUSD: 0,
      attempts,
    },
  };
}
