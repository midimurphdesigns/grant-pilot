/**
 * Smoke test — one verified intent, live agent run, transcript to stdout.
 *
 * Requires ANTHROPIC_API_KEY (and optionally SAM_GOV_API_KEY for the
 * SAM registration check). Without keys this aborts with a clear
 * error pointing at the replay path (`bun run demo`).
 *
 * Run:  bun run smoke
 */

import { runPlanner } from "./agent/planner";
import type { UserProfile } from "./agents/types";
import { renderTranscript } from "./eval/render";

const DEFAULT_INTENT =
  "I run a 12-person construction firm in Arizona. What infrastructure-related federal grants might fit?";

const DEFAULT_PROFILE: UserProfile = {
  naicsCode: "236220",
  employeeCount: 12,
  annualRevenueUSD: 2_400_000,
  state: "AZ",
  zip: "85004",
  ownership: {
    womanOwned: false,
    veteranOwned: false,
    minorityOwned: false,
    disadvantaged: false,
  },
  entityType: "for-profit",
  yearsInOperation: 6,
  missionDescription:
    "General contracting focused on small-to-mid commercial infrastructure work across the Phoenix metro area.",
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY not set. Set it in .env or run `bun run demo` for the no-key replay path.",
    );
    process.exit(1);
  }

  console.log(`> Intent: ${DEFAULT_INTENT}`);
  console.log("> Running planner...\n");

  const run = await runPlanner({
    intent: DEFAULT_INTENT,
    profile: DEFAULT_PROFILE,
  });

  console.log(renderTranscript(run));
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
