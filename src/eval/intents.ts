/**
 * Intent loader — reads eval/intents.jsonl, validates each line.
 *
 * Single source of truth for: the eval set, the hosted-demo allowlist,
 * and the recording manifest. Keeping all three driven by one file
 * means the demo can never offer an intent the eval doesn't cover,
 * and the eval can never drift from the recordings.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import type { UserProfile } from "../agents/types";

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
  id: z.string().min(1),
  intent: z.string().min(10),
  profile: ProfileSchema,
});

export type Intent = {
  id: string;
  intent: string;
  profile: UserProfile;
};

export function loadIntents(path = "eval/intents.jsonl"): Intent[] {
  const full = resolve(process.cwd(), path);
  const raw = readFileSync(full, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const out: Intent[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(`intents.jsonl line ${i + 1}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
    const parsed = IntentSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`intents.jsonl line ${i + 1}: ${parsed.error.message}`);
    }
    out.push(parsed.data);
  }
  return out;
}
