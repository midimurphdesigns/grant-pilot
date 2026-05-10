/**
 * Eval runner.
 *
 *   bun run eval            — live run all 5 intents, score, print table
 *   bun run eval:record     — same, but append each PlannerRun to recordings
 *   bun run demo            — replay from recordings (no API key needed)
 *
 * Records are keyed by intent id; the latest record for an id wins.
 */

import Anthropic from "@anthropic-ai/sdk";

import { runPlanner } from "../agent/planner";
import { loadIntents } from "./intents";
import { scoreRun } from "./scorer";
import { renderTranscript } from "./render";
import { compactRecordings, getRecording, recordRun } from "./recording";

type Mode = "live" | "record" | "replay";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--record")) return "record";
  if (argv.includes("--replay")) return "replay";
  return "live";
}

async function main() {
  const mode = parseMode(process.argv);
  const intents = loadIntents();

  if (mode === "replay") {
    let pass = 0;
    for (const intent of intents) {
      const rec = getRecording(intent.id);
      if (!rec) {
        console.log(`[${intent.id}] no recording found — run \`bun run eval:record\` first`);
        continue;
      }
      console.log(`\n--- replay: ${intent.id} (recorded ${rec.recordedAt}) ---`);
      console.log(renderTranscript(rec.run));
      const s = scoreRun(intent.id, rec.run);
      pass += s.passed ? 1 : 0;
      console.log(`SCORE: ${s.passed ? "PASS" : "FAIL"}`);
      for (const c of s.checks) {
        console.log(`  [${c.passed ? "+" : "-"}] ${c.name} — ${c.detail}`);
      }
    }
    console.log(`\n${pass}/${intents.length} replay intents passed`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set. Use `bun run demo` (--replay) for the no-key path.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  let pass = 0;
  let totalCost = 0;
  for (const intent of intents) {
    console.log(`\n--- live: ${intent.id} ---`);
    const run = await runPlanner({ client, intent: intent.intent, profile: intent.profile });
    console.log(renderTranscript(run));
    if (mode === "record") {
      recordRun(intent.id, run);
    }
    const s = scoreRun(intent.id, run);
    pass += s.passed ? 1 : 0;
    totalCost += s.totalCostUSD;
    console.log(`SCORE: ${s.passed ? "PASS" : "FAIL"}`);
    for (const c of s.checks) {
      console.log(`  [${c.passed ? "+" : "-"}] ${c.name} — ${c.detail}`);
    }
  }

  if (mode === "record") {
    compactRecordings();
    console.log("\n(recordings compacted to eval/recordings/default.jsonl)");
  }

  console.log(`\n${pass}/${intents.length} intents passed — total cost $${totalCost.toFixed(4)}`);
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(1);
});
