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
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { callLadder } from "../agent/fallback-ladder";
import { grantDetail } from "../tools/grant-detail";
import { entityLookup } from "../tools/entity-lookup";
import {
  firstText,
  parseJsonLoose,
  provenanceOf,
  type SubAgentEnvelope,
  type UserProfile,
} from "./types";

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

const SYSTEM = `You assess whether a specific applicant is eligible for a specific federal grant opportunity.

Output ONLY a JSON object with this exact shape:
{
  "verdict": "pass" | "fail" | "uncertain",
  "reasons": [ "<grounded in eligibility text>", ... ],
  "blockers": [ "<hard disqualifiers, if any>", ... ],
  "notes": "<short caveats or recommended next steps>"
}

Guidelines:
- "pass" = applicant clearly satisfies all stated eligibility criteria
- "fail" = applicant clearly violates one or more hard criteria (wrong applicant type, wrong industry, wrong geography, registration lapsed)
- "uncertain" = eligibility text is ambiguous, applicant data is incomplete, or criteria require judgment beyond what the profile contains
- Cite the eligibility text, not your priors. If the text doesn't address an attribute, say so in notes.
- Output JSON only. No prose, no markdown fences.`;

export async function check(args: {
  client: Anthropic;
  profile: UserProfile;
  opportunityNumber: string;
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

  const ladder = await callLadder({
    client: args.client,
    systemPrompt: SYSTEM,
    userMessage,
    maxTokens: 1500,
  });

  let verdict: z.infer<typeof VerdictSchema>;
  try {
    const parsed = parseJsonLoose<unknown>(firstText(ladder.rawResponse));
    verdict = VerdictSchema.parse(parsed);
  } catch (err) {
    return {
      result: {
        kind: "error",
        message: `verdict parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      provenance: provenanceOf(ladder),
    };
  }

  // If SAM is checked and inactive, hoist that into blockers regardless
  // of what the model said — registration status is a hard gate.
  const blockers = [...verdict.blockers];
  if (samRegistration.checked && samRegistration.active === false) {
    blockers.unshift(`SAM.gov registration not active (${samRegistration.message})`);
  }

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
    provenance: provenanceOf(ladder),
  };
}
