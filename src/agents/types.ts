/**
 * Shared types for sub-agents.
 *
 * The planner sees each sub-agent as a tool returning a structured
 * envelope: result + provenance (which ladder rung answered, cost,
 * latency). This lets the planner compose a transcript that visitors
 * can read alongside the agent's reasoning.
 */

import type { LadderResponse } from "../agent/fallback-ladder";

export type UserProfile = {
  /** NAICS industry classification — drives most eligibility filters. */
  naicsCode: string;
  /** Headcount, full-time-equivalent. */
  employeeCount: number;
  /** Annual revenue in USD (alternative SBA size standard). */
  annualRevenueUSD: number;
  /** Two-letter US state code. */
  state: string;
  /** 5-digit ZIP. */
  zip: string;
  /** Ownership designations relevant to set-aside eligibility. */
  ownership: {
    womanOwned: boolean;
    veteranOwned: boolean;
    minorityOwned: boolean;
    disadvantaged: boolean;
  };
  /** Tax/legal entity type. */
  entityType: "for-profit" | "nonprofit" | "sole-prop" | "co-op" | "tribal";
  /** Years since legal formation. */
  yearsInOperation: number;
  /** Optional — if present, eligibility can verify SAM.gov registration. */
  uei?: string;
  /** Optional — short prose describing what the org does. */
  missionDescription?: string;
};

export type SubAgentEnvelope<T> = {
  result: T;
  provenance: {
    rung: string;
    model: string;
    latencyMs: number;
    costUSD: number;
    attempts: { rung: string; error: string }[];
  };
};

export function provenanceOf<T>(ladder: LadderResponse<T>): SubAgentEnvelope<unknown>["provenance"] {
  return {
    rung: ladder.rung.name,
    model: ladder.rung.model,
    latencyMs: ladder.latencyMs,
    costUSD: ladder.costUSD,
    attempts: ladder.attempts,
  };
}

/**
 * Extract the first text block from an Anthropic message. Sub-agents
 * use plain-text JSON output (no tool-use round trip — the sub-agent
 * IS the tool from the planner's perspective).
 */
export function firstText(msg: { content: { type: string; text?: string }[] }): string {
  for (const block of msg.content) {
    if (block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}

/**
 * Strip ```json fences and parse. Sub-agents are instructed to reply
 * with raw JSON, but Sonnet sometimes wraps it. Be forgiving.
 */
export function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced?.[1] ?? trimmed;
  return JSON.parse(body) as T;
}
