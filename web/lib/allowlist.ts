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
