/**
 * Recording / replay layer — mirrors fedbench's pattern.
 *
 * Two modes:
 *   - record: run the planner live, capture the full PlannerRun, append
 *     to eval/recordings/default.jsonl keyed by intent id.
 *   - replay: read the JSONL, return the recorded run for a given id.
 *     No API key needed. ~1s render time.
 *
 * The hosted demo uses replay as its over-budget fallback: when the
 * daily $3 cap is hit, the /api/run route serves the recorded run
 * with a banner explaining why.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { PlannerRun } from "../agent/planner";

export type RecordedRun = {
  id: string;
  recordedAt: string;
  run: PlannerRun;
};

const DEFAULT_PATH = "eval/recordings/default.jsonl";

export function recordRun(id: string, run: PlannerRun, path = DEFAULT_PATH): void {
  const full = resolve(process.cwd(), path);
  mkdirSync(dirname(full), { recursive: true });
  const entry: RecordedRun = {
    id,
    recordedAt: new Date().toISOString(),
    run,
  };
  appendFileSync(full, JSON.stringify(entry) + "\n", "utf8");
}

export function loadRecordings(path = DEFAULT_PATH): Map<string, RecordedRun> {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return new Map();
  const raw = readFileSync(full, "utf8");
  const out = new Map<string, RecordedRun>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as RecordedRun;
    // Keep the most-recent recording per id.
    out.set(parsed.id, parsed);
  }
  return out;
}

/**
 * Replace the recordings file with a fresh dedup'd snapshot. Useful
 * after a record run to keep the file from growing unbounded.
 */
export function compactRecordings(path = DEFAULT_PATH): void {
  const recs = loadRecordings(path);
  const full = resolve(process.cwd(), path);
  const lines = Array.from(recs.values()).map((r) => JSON.stringify(r));
  writeFileSync(full, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
}

export function getRecording(id: string, path = DEFAULT_PATH): RecordedRun | null {
  return loadRecordings(path).get(id) ?? null;
}
