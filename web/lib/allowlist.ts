/**
 * Allowlist — the 5 intents the hosted demo will run.
 *
 * Loaded from the canonical eval/intents.jsonl at build time, not at
 * request time, so the bundle is self-contained on Vercel and the
 * demo can never drift from the eval set.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const ProfileSchema = z.object({
  naicsCode: z.string(),
  employeeCount: z.number(),
  annualRevenueUSD: z.number(),
  state: z.string().length(2),
  zip: z.string(),
  ownership: z.object({
    womanOwned: z.boolean(),
    veteranOwned: z.boolean(),
    minorityOwned: z.boolean(),
    disadvantaged: z.boolean(),
  }),
  entityType: z.enum(["for-profit", "nonprofit", "sole-prop", "co-op", "tribal"]),
  yearsInOperation: z.number(),
  uei: z.string().optional(),
  missionDescription: z.string().optional(),
});

const IntentSchema = z.object({
  id: z.string(),
  intent: z.string().min(10),
  profile: ProfileSchema,
});

export type AllowlistedIntent = z.infer<typeof IntentSchema>;

let cache: AllowlistedIntent[] | null = null;

export function loadAllowlist(): AllowlistedIntent[] {
  if (cache) return cache;
  const path = resolve(process.cwd(), "../eval/intents.jsonl");
  const raw = readFileSync(path, "utf8");
  const out: AllowlistedIntent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    out.push(IntentSchema.parse(JSON.parse(line)));
  }
  cache = out;
  return out;
}

export function findIntent(id: string): AllowlistedIntent | null {
  return loadAllowlist().find((i) => i.id === id) ?? null;
}

/**
 * Custom-intent guardrails. Visitors get to free-text the *intent*
 * (the funding-need description) but pick from a preset profile —
 * we never let strangers free-text the structured profile, which
 * would be the prompt-injection surface.
 */
export const CUSTOM_INTENT_MIN_CHARS = 20;
export const CUSTOM_INTENT_MAX_CHARS = 600;
export const CUSTOM_MISSION_MAX_CHARS = 400;

/**
 * Schema for a fully custom user profile. Every field is bounded —
 * enums, integers with min/max, fixed-format strings, booleans. The
 * only free-text field is `missionDescription`, which is length-capped
 * and run through `rejectionReason()` like the intent itself.
 *
 * Constraining each field this way means there's no injection surface
 * here that the preset profile didn't already have.
 */
export const CustomProfileSchema = z.object({
  naicsCode: z
    .string()
    .regex(/^\d{2,6}$/, "NAICS code must be 2-6 digits"),
  employeeCount: z.number().int().min(1).max(10000),
  annualRevenueUSD: z.number().min(0).max(1_000_000_000),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}$/, "ZIP must be 5 digits"),
  ownership: z.object({
    womanOwned: z.boolean(),
    veteranOwned: z.boolean(),
    minorityOwned: z.boolean(),
    disadvantaged: z.boolean(),
  }),
  entityType: z.enum(["for-profit", "nonprofit", "sole-prop", "co-op", "tribal"]),
  yearsInOperation: z.number().min(0).max(200),
  missionDescription: z.string().max(CUSTOM_MISSION_MAX_CHARS).optional(),
});
export type CustomProfile = z.infer<typeof CustomProfileSchema>;

/** Reject obvious prompt-injection / jailbreak attempts before any model call. */
export function rejectionReason(intent: string): string | null {
  const trimmed = intent.trim();
  if (trimmed.length < CUSTOM_INTENT_MIN_CHARS) {
    return `Please describe your funding need in at least ${CUSTOM_INTENT_MIN_CHARS} characters.`;
  }
  if (trimmed.length > CUSTOM_INTENT_MAX_CHARS) {
    return `Please keep it under ${CUSTOM_INTENT_MAX_CHARS} characters.`;
  }
  // Heuristic patterns that virtually never appear in genuine funding-need
  // descriptions but are common in prompt-injection attempts. Cheap to check,
  // worth the false-positive risk for a public hosted demo.
  const lower = trimmed.toLowerCase();
  const banned = [
    "ignore previous",
    "ignore above",
    "ignore the above",
    "disregard previous",
    "system prompt",
    "system:",
    "you are now",
    "act as",
    "jailbreak",
    "<|",
    "</s>",
    "[INST]",
  ];
  for (const phrase of banned) {
    if (lower.includes(phrase.toLowerCase())) {
      return "That input looks more like a prompt-injection attempt than a funding-need description. Please describe your business or nonprofit's actual funding need.";
    }
  }
  return null;
}
