/**
 * Planner — main orchestrator.
 *
 * The planner sees three sub-agents as tools (discovery, eligibility,
 * drafter) and runs a multi-turn loop:
 *
 *   1. Always start with discovery to surface candidates.
 *   2. For the top candidates (score >= MIN_SCORE), check eligibility.
 *   3. For the highest-scoring grant that passes eligibility, draft a
 *      skeleton. If none pass cleanly, draft for the highest "uncertain"
 *      and surface the caveats prominently.
 *   4. Compose a transcript: query rationale + ranked candidates +
 *      verdicts + draft + per-step provenance.
 *
 * The loop is bounded (MAX_TURNS) to prevent runaway sub-agent calls.
 * Errors at any step bubble up as structured TranscriptStep entries
 * the renderer can display verbatim — the planner never throws.
 */

import {
  discover,
  type DiscoveryResult,
  type PartialDiscovery,
} from "../agents/discovery";
import {
  check,
  type EligibilityResult,
  type PartialEligibility,
} from "../agents/eligibility";
import { draft, type DrafterResult, type PartialDraft } from "../agents/drafter";
import type { SubAgentEnvelope, UserProfile } from "../agents/types";

const MIN_SCORE_FOR_ELIGIBILITY = 30;
const MAX_ELIGIBILITY_CHECKS = 3;

export type TranscriptStep =
  | {
      kind: "discovery";
      envelope: SubAgentEnvelope<DiscoveryResult>;
    }
  | {
      kind: "eligibility";
      opportunityNumber: string;
      envelope: SubAgentEnvelope<EligibilityResult>;
    }
  | {
      kind: "drafter";
      opportunityNumber: string;
      envelope: SubAgentEnvelope<DrafterResult>;
    }
  | {
      kind: "decision";
      message: string;
    };

export type PlannerSummary = {
  intent: string;
  shortlist: {
    opportunityNumber: string;
    title: string;
    score: number;
    verdict: "pass" | "fail" | "uncertain" | "not-checked";
    blockers: string[];
  }[];
  draftFor: string | null;
  totalCostUSD: number;
  totalLatencyMs: number;
};

export type PlannerRun = {
  steps: TranscriptStep[];
  summary: PlannerSummary;
};

export async function runPlanner(args: {
  intent: string;
  profile: UserProfile;
  /**
   * Streaming callbacks. Each sub-agent's streamObject pushes partials
   * here, and the HTTP route forwards them to the browser as NDJSON
   * events. The portfolio value is showing fluency in all three of the
   * AI SDK's streaming primitives:
   *   - streamObject for Discovery + Eligibility (progressive
   *     structured disclosure)
   *   - streamText for Drafter (token-by-token prose with tool-use)
   *   - generateObject elsewhere (when streaming has no UX value, e.g.
   *     the cheap derive-query step inside Discovery)
   */
  onDiscoveryPartial?: (partial: PartialDiscovery) => void;
  onEligibilityPartial?: (partial: PartialEligibility) => void;
  onDrafterPartial?: (partial: PartialDraft, opportunityNumber: string) => void;
}): Promise<PlannerRun> {
  const steps: TranscriptStep[] = [];

  // Step 1 — discovery.
  const discoveryEnv = await discover({
    intent: args.intent,
    profile: args.profile,
    onPartial: args.onDiscoveryPartial,
  });
  steps.push({ kind: "discovery", envelope: discoveryEnv });

  if (discoveryEnv.result.kind === "error") {
    steps.push({
      kind: "decision",
      message: `Stopping: discovery failed (${discoveryEnv.result.message}).`,
    });
    return { steps, summary: emptySummary(args.intent, steps) };
  }

  if (discoveryEnv.result.kind === "empty") {
    steps.push({
      kind: "decision",
      message: `Stopping: no grants matched query "${discoveryEnv.result.query}". Consider loosening keywords or broadening the intent.`,
    });
    return { steps, summary: emptySummary(args.intent, steps) };
  }

  const candidates = discoveryEnv.result.candidates;
  const toCheck = candidates
    .filter((c) => c.score >= MIN_SCORE_FOR_ELIGIBILITY)
    .slice(0, MAX_ELIGIBILITY_CHECKS);

  if (toCheck.length === 0) {
    steps.push({
      kind: "decision",
      message: `Stopping: no candidates scored above ${MIN_SCORE_FOR_ELIGIBILITY}. Top score was ${candidates[0]?.score ?? 0}.`,
    });
    return { steps, summary: summaryFromSteps(args.intent, steps, null) };
  }

  // Step 2 — eligibility for the top candidates.
  const verdicts = new Map<string, EligibilityResult & { kind: "verdict" }>();
  for (const c of toCheck) {
    const env = await check({
      profile: args.profile,
      opportunityNumber: c.opportunityNumber,
      onPartial: args.onEligibilityPartial,
    });
    steps.push({ kind: "eligibility", opportunityNumber: c.opportunityNumber, envelope: env });
    if (env.result.kind === "verdict") {
      verdicts.set(c.opportunityNumber, env.result);
    }
  }

  // Step 3 — pick the best target for drafting.
  const ranked = toCheck.map((c) => {
    const v = verdicts.get(c.opportunityNumber);
    return { candidate: c, verdict: v };
  });

  const targets = ranked
    .filter((r) => r.verdict?.verdict === "pass")
    .concat(ranked.filter((r) => r.verdict?.verdict === "uncertain"));

  const target = targets[0]?.candidate ?? null;

  if (!target) {
    steps.push({
      kind: "decision",
      message:
        "Stopping before draft: no candidate passed eligibility cleanly and none were uncertain enough to be worth drafting. Surface verdicts and stop.",
    });
    return { steps, summary: summaryFromSteps(args.intent, steps, null) };
  }

  steps.push({
    kind: "decision",
    message: `Drafting for ${target.opportunityNumber} — best ${
      verdicts.get(target.opportunityNumber)?.verdict ?? "candidate"
    } match in shortlist.`,
  });

  // Step 4 — draft.
  const draftEnv = await draft({
    profile: args.profile,
    opportunityNumber: target.opportunityNumber,
    onPartial: args.onDrafterPartial
      ? (partial) => args.onDrafterPartial!(partial, target.opportunityNumber)
      : undefined,
  });
  steps.push({ kind: "drafter", opportunityNumber: target.opportunityNumber, envelope: draftEnv });

  return {
    steps,
    summary: summaryFromSteps(args.intent, steps, target.opportunityNumber),
  };
}

function emptySummary(intent: string, steps: TranscriptStep[]): PlannerSummary {
  const totals = totalCostAndLatency(steps);
  return {
    intent,
    shortlist: [],
    draftFor: null,
    totalCostUSD: totals.cost,
    totalLatencyMs: totals.latency,
  };
}

function summaryFromSteps(
  intent: string,
  steps: TranscriptStep[],
  draftFor: string | null,
): PlannerSummary {
  const discovery = steps.find((s) => s.kind === "discovery");
  const candidates =
    discovery?.kind === "discovery" && discovery.envelope.result.kind === "candidates"
      ? discovery.envelope.result.candidates
      : [];

  const verdictByOpp = new Map<string, "pass" | "fail" | "uncertain">();
  for (const s of steps) {
    if (s.kind === "eligibility" && s.envelope.result.kind === "verdict") {
      verdictByOpp.set(s.opportunityNumber, s.envelope.result.verdict);
    }
  }
  const blockersByOpp = new Map<string, string[]>();
  for (const s of steps) {
    if (s.kind === "eligibility" && s.envelope.result.kind === "verdict") {
      blockersByOpp.set(s.opportunityNumber, s.envelope.result.blockers);
    }
  }

  const shortlist = candidates.map((c) => ({
    opportunityNumber: c.opportunityNumber,
    title: c.title,
    score: c.score,
    verdict: verdictByOpp.get(c.opportunityNumber) ?? ("not-checked" as const),
    blockers: blockersByOpp.get(c.opportunityNumber) ?? [],
  }));

  const totals = totalCostAndLatency(steps);
  return {
    intent,
    shortlist,
    draftFor,
    totalCostUSD: totals.cost,
    totalLatencyMs: totals.latency,
  };
}

function totalCostAndLatency(steps: TranscriptStep[]): { cost: number; latency: number } {
  let cost = 0;
  let latency = 0;
  for (const s of steps) {
    if (s.kind === "decision") continue;
    cost += s.envelope.provenance.costUSD;
    latency += s.envelope.provenance.latencyMs;
  }
  return { cost, latency };
}
