/**
 * Eligibility sub-agent.
 *
 * Given a user profile and a target grant, fetch the full grant detail
 * (eligibility text, applicant types, funding ceiling) and return a
 * structured verdict: pass / fail / uncertain, with reasons grounded
 * in the eligibility text.
 *
 * Optionally checks SAM.gov registration if profile.uei is set —
 * unregistered orgs cannot receive most federal grants regardless of
 * other eligibility criteria.
 *
 * Uses the AI SDK's `streamObject` for progressive structured output:
 * the Zod VerdictSchema constrains the model's response, the SDK
 * validates + retries on schema failure, and the partial-object stream
 * lets the UI render the verdict, reasons, and blockers as they
 * generate (verdict typically settles within the first ~50 tokens, so
 * the user sees "pass / fail / uncertain" almost immediately and the
 * reasons fill in below).
 */

import { streamObject } from "ai";
import { z } from "zod";

import { anthropic } from "../provider";
import { LADDER, type LadderRung } from "../agent/fallback-ladder";
import { grantDetail } from "../tools/grant-detail";
import { entityLookup } from "../tools/entity-lookup";
import { type SubAgentEnvelope, type UserProfile } from "./types";

const VerdictSchema = z.object({
  verdict: z.enum(["pass", "fail", "uncertain"]),
  reasons: z.array(z.string().min(2).max(400)).min(1).max(8),
  blockers: z.array(z.string().min(2).max(400)).default([]),
  notes: z.string().max(800).default(""),
});

export type EligibilityResult =
  | {
      kind: "verdict";
      opportunityNumber: string;
      title: string;
      verdict: "pass" | "fail" | "uncertain";
      reasons: string[];
      blockers: string[];
      notes: string;
      samRegistration: {
        checked: boolean;
        active: boolean | null;
        message: string;
      };
    }
  | { kind: "error"; message: string };

/**
 * Partial eligibility shape streamed to the UI. Each field is optional —
 * the model emits `verdict` first (within ~50 tokens), then reasons one
 * at a time, then blockers, then notes. The UI can show the verdict
 * badge almost immediately and accumulate reasons below.
 */
export type PartialEligibility = {
  opportunityNumber: string;
  title: string;
  verdict?: "pass" | "fail" | "uncertain";
  reasons?: string[];
  blockers?: string[];
  notes?: string;
  samRegistration: {
    checked: boolean;
    active: boolean | null;
    message: string;
  };
};

const SYSTEM = `You assess whether a specific applicant is eligible for a specific federal grant opportunity.

Guidelines:
- "pass" = applicant clearly satisfies all stated eligibility criteria
- "fail" = applicant clearly violates one or more hard criteria (wrong applicant type, wrong industry, wrong geography, registration lapsed)
- "uncertain" = eligibility text is ambiguous, applicant data is incomplete, or criteria require judgment beyond what the profile contains
- Cite the eligibility text, not your priors. If the text doesn't address an attribute, say so in notes.`;

export async function check(args: {
  profile: UserProfile;
  opportunityNumber: string;
  /**
   * Optional callback fired as the verdict step's `streamObject` emits
   * each partial. The model emits the verdict field first, so the UI
   * can render a pass/fail/uncertain badge almost immediately, then
   * stream reasons + blockers in below.
   */
  onPartial?: (partial: PartialEligibility) => void;
}): Promise<SubAgentEnvelope<EligibilityResult>> {
  // Step 1 — pull the full grant record.
  const detail = await grantDetail({ opportunityNumber: args.opportunityNumber });
  if (!detail.ok) {
    return {
      result: {
        kind: "error",
        message: `grant_detail ${detail.error.kind}: ${"message" in detail.error ? detail.error.message : ""}`,
      },
      // Sub-agent envelope still needs provenance; we haven't called the
      // model yet, so report a synthetic zero-cost record.
      provenance: {
        rung: "n/a",
        model: "n/a",
        latencyMs: 0,
        costUSD: 0,
        attempts: [],
      },
    };
  }

  // Step 2 — optionally verify SAM.gov registration. Failure here is
  // not fatal; it becomes a blocker the verdict surfaces.
  let samRegistration: EligibilityResult & { kind: "verdict" } extends {
    samRegistration: infer S;
  }
    ? S
    : never = { checked: false, active: null, message: "no UEI in profile" };
  if (args.profile.uei) {
    const sam = await entityLookup({ uei: args.profile.uei });
    if (sam.ok) {
      const active = sam.data.registrationStatus?.toLowerCase() === "active";
      samRegistration = {
        checked: true,
        active,
        message: active
          ? "SAM.gov registration active"
          : `SAM.gov status: ${sam.data.registrationStatus ?? "unknown"}`,
      };
    } else {
      samRegistration = {
        checked: true,
        active: null,
        message: `SAM.gov ${sam.error.kind}`,
      };
    }
  }

  // Step 3 — ask the model for a verdict, grounded in the eligibility text.
  const userMessage = [
    `Applicant profile: ${JSON.stringify(args.profile)}`,
    `SAM.gov registration: ${samRegistration.message}`,
    "",
    `Opportunity: ${detail.data.title} (${detail.data.opportunityNumber})`,
    `Agency: ${detail.data.agencyName ?? "unknown"}`,
    `Applicant types accepted: ${detail.data.applicantTypes.join(", ") || "(unspecified)"}`,
    `Funding range: $${detail.data.fundingFloorUSD ?? "?"} - $${detail.data.fundingCeilingUSD ?? "?"}`,
    "",
    "Eligibility text (verbatim from grants.gov):",
    detail.data.eligibilityText ?? "(none provided — note this in your verdict)",
    "",
    "Description:",
    detail.data.description ?? "(none)",
  ].join("\n");

  // streamObject so the UI can show the verdict badge as soon as the
  // model emits it (~50 tokens) and stream reasons in below. Inline
  // ladder logic mirrors discovery.ts / drafter.ts — streamObject's
  // start→stream→finish lifecycle doesn't fit callLadder's synchronous
  // result shape.
  const attempts: { rung: string; error: string }[] = [];
  let result:
    | {
        verdict: { verdict: "pass" | "fail" | "uncertain"; reasons: string[]; blockers: string[]; notes: string };
        latencyMs: number;
        usage: { inputTokens: number; outputTokens: number };
        rung: LadderRung;
      }
    | null = null;

  for (const rung of LADDER) {
    const startedAt = Date.now();
    try {
      const model = anthropic(rung.model);
      const r = streamObject({
        model,
        schema: VerdictSchema,
        system: SYSTEM,
        prompt: userMessage,
        maxRetries: 2,
      });

      // Pump partials to the caller. Hoist SAM blocker into the partial
      // too — even mid-stream, the UI should already know if SAM has
      // disqualified the applicant.
      if (args.onPartial) {
        for await (const partial of r.partialObjectStream) {
          const partialBlockers = Array.isArray(partial.blockers)
            ? (partial.blockers.filter((b): b is string => typeof b === "string"))
            : [];
          const hoisted = [...partialBlockers];
          if (samRegistration.checked && samRegistration.active === false) {
            hoisted.unshift(`SAM.gov registration not active (${samRegistration.message})`);
          }
          args.onPartial({
            opportunityNumber: detail.data.opportunityNumber,
            title: detail.data.title,
            verdict: partial.verdict as "pass" | "fail" | "uncertain" | undefined,
            reasons: Array.isArray(partial.reasons)
              ? partial.reasons.filter((r): r is string => typeof r === "string")
              : undefined,
            blockers: hoisted,
            notes: typeof partial.notes === "string" ? partial.notes : undefined,
            samRegistration,
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
      result = {
        verdict: finalObject,
        latencyMs,
        usage: {
          inputTokens: usage.promptTokens ?? 0,
          outputTokens: usage.completionTokens ?? 0,
        },
        rung,
      };
      break;
    } catch (err) {
      attempts.push({
        rung: rung.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!result) {
    return {
      result: {
        kind: "error",
        message: `verdict generation failed across all ladder rungs: ${JSON.stringify(attempts)}`,
      },
      provenance: {
        rung: "exhausted",
        model: "exhausted",
        latencyMs: 0,
        costUSD: 0,
        attempts,
      },
    };
  }

  const verdict = result.verdict;

  // If SAM is checked and inactive, hoist that into blockers regardless
  // of what the model said — registration status is a hard gate.
  const blockers = [...verdict.blockers];
  if (samRegistration.checked && samRegistration.active === false) {
    blockers.unshift(`SAM.gov registration not active (${samRegistration.message})`);
  }

  const rungUsed = result.rung;
  const costUSD =
    (result.usage.inputTokens / 1_000_000) * rungUsed.inputUsdPerMTok +
    (result.usage.outputTokens / 1_000_000) * rungUsed.outputUsdPerMTok;

  return {
    result: {
      kind: "verdict",
      opportunityNumber: detail.data.opportunityNumber,
      title: detail.data.title,
      verdict: verdict.verdict,
      reasons: verdict.reasons,
      blockers,
      notes: verdict.notes,
      samRegistration,
    },
    provenance: {
      rung: rungUsed.name,
      model: rungUsed.model,
      latencyMs: result.latencyMs,
      costUSD,
      attempts,
    },
  };
}
