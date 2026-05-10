/**
 * Replay loader — reads ../eval/recordings/default.jsonl at build time
 * so the over-budget fallback path doesn't need filesystem access at
 * request time on Vercel.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type RecordedRun = {
  id: string;
  recordedAt: string;
  // PlannerRun shape — kept loose here so web/ doesn't import from src/
  // and end up bundling node-only deps.
  run: unknown;
};

let cache: Map<string, RecordedRun> | null = null;

export function loadReplays(): Map<string, RecordedRun> {
  if (cache) return cache;
  const path = resolve(process.cwd(), "../eval/recordings/default.jsonl");
  const out = new Map<string, RecordedRun>();
  if (!existsSync(path)) {
    cache = out;
    return out;
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as RecordedRun;
    out.set(parsed.id, parsed);
  }
  cache = out;
  return out;
}

export function getReplay(id: string): RecordedRun | null {
  return loadReplays().get(id) ?? null;
}
