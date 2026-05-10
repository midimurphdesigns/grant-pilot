/**
 * Per-intent scorer — pass criteria for the 5-intent eval set.
 *
 * Each intent has a structural-criteria function that asks: did the
 * agent produce a plausible end-to-end result? We deliberately avoid
 * scoring against a fixed expected-output (federal grant listings
 * change weekly); instead we check the SHAPE of the run:
 *
 *   - discovery returned candidates
 *   - at least one candidate cleared eligibility (pass or uncertain)
 *   - drafter produced a structured skeleton
 *   - total cost stayed under $0.20 per run
 *   - all eligibility verdicts are grounded (have at least 1 reason)
 *
 * This is the same pattern fedbench uses — the eval scores the agent's
 * behavior, not its memorization of a fixed corpus.
 */

import type { PlannerRun } from "../agent/planner";

export type Score = {
  intentId: string;
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  totalCostUSD: number;
};

const COST_CEILING_USD = 0.2;

export function scoreRun(intentId: string, run: PlannerRun): Score {
  const checks: Score["checks"] = [];

  // Check 1 — discovery surfaced candidates.
  const discovery = run.steps.find((s) => s.kind === "discovery");
  const hasCandidates =
    discovery?.kind === "discovery" &&
    discovery.envelope.result.kind === "candidates" &&
    discovery.envelope.result.candidates.length > 0;
  checks.push({
    name: "discovery returned candidates",
    passed: hasCandidates,
    detail: hasCandidates
      ? `${discovery && discovery.kind === "discovery" && discovery.envelope.result.kind === "candidates" ? discovery.envelope.result.candidates.length : 0} candidates`
      : "no candidates returned",
  });

  // Check 2 — at least one eligibility verdict was pass or uncertain.
  const eligibility = run.steps.filter((s) => s.kind === "eligibility");
  const passOrUncertain = eligibility.filter(
    (s) =>
      s.kind === "eligibility" &&
      s.envelope.result.kind === "verdict" &&
      (s.envelope.result.verdict === "pass" || s.envelope.result.verdict === "uncertain"),
  );
  checks.push({
    name: "at least one candidate passed or was uncertain",
    passed: passOrUncertain.length > 0,
    detail: `${passOrUncertain.length} of ${eligibility.length} eligibility checks`,
  });

  // Check 3 — all eligibility verdicts are grounded (have reasons).
  const allGrounded = eligibility.every(
    (s) =>
      s.kind === "eligibility" &&
      (s.envelope.result.kind !== "verdict" ||
        s.envelope.result.reasons.length > 0),
  );
  checks.push({
    name: "all eligibility verdicts are grounded with reasons",
    passed: allGrounded,
    detail: allGrounded ? "all verdicts cited reasons" : "at least one verdict had no reasons",
  });

  // Check 4 — drafter produced a skeleton (when a draft was attempted).
  const drafter = run.steps.find((s) => s.kind === "drafter");
  const hasDraft =
    drafter?.kind === "drafter" &&
    drafter.envelope.result.kind === "draft" &&
    drafter.envelope.result.sections.length >= 3;
  // A run that legitimately stops before drafting (no candidates passed)
  // shouldn't fail this check — only fail if drafter was attempted and
  // didn't produce a valid skeleton.
  const drafterAttempted = drafter !== undefined;
  checks.push({
    name: "drafter produced a valid skeleton (when attempted)",
    passed: !drafterAttempted || hasDraft,
    detail: drafterAttempted ? (hasDraft ? "skeleton OK" : "skeleton missing or too short") : "no draft attempted (acceptable)",
  });

  // Check 5 — cost ceiling.
  const underCeiling = run.summary.totalCostUSD <= COST_CEILING_USD;
  checks.push({
    name: `total cost under $${COST_CEILING_USD}`,
    passed: underCeiling,
    detail: `$${run.summary.totalCostUSD.toFixed(4)}`,
  });

  return {
    intentId,
    passed: checks.every((c) => c.passed),
    checks,
    totalCostUSD: run.summary.totalCostUSD,
  };
}
