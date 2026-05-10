# Decisions (ADR log)

Append-only. Newer ADRs at the bottom. Each entry: context, decision, consequences.

---

## ADR-001 — Stack: Bun + TypeScript strict + Anthropic SDK + Zod

**Context.** Need to pick a runtime, language, and SDK shape for a portfolio project that demonstrates production-shape decisions.

**Decision.** Bun + TypeScript strict + `@anthropic-ai/sdk` + `zod`. Same toolchain as the two prior projects in the trilogy (fedbench, fieldops-mcp).

**Consequences.** A reviewer who has read fedbench instantly recognizes the file shape and can focus on what's *new* (sub-agent orchestration). Bun gives single-file scripts (`bun run smoke.ts`) without a build step. Zod boundary-validation matches the way real production AI code is written — every external response is parsed before it reaches business logic. No `any` anywhere.

---

## ADR-002 — Port the fallback ladder from fedbench instead of rewriting

**Context.** The planner and three sub-agents all need a way to call Claude with degradation behavior (rate-limit, 5xx, network).

**Decision.** Lift `fedbench/src/agent/fallback-ladder.ts` directly. Keep the same Sonnet 4.6 → Haiku 4.5 ladder. Add a `tools` parameter for tool-use turns; otherwise unchanged.

**Consequences.** "Reused from fedbench" is a credible composition story rather than a copy-paste shortcut. The same ladder semantics across two repos signals a developer who internalizes patterns rather than reinventing them per project. Rung-3 (open-weights via OpenRouter) is intentionally still stubbed — same status as fedbench, no over-promising.

---

## ADR-003 — Three sub-agents, not more

**Context.** A grants workflow has more stages than three (e.g., budget builder, compliance reviewer, prior-art search, narrative editor). Easy to keep adding.

**Decision.** Cap at three: discovery, eligibility, drafter. Document the cap explicitly so the cap itself becomes a signal.

**Consequences.** The shape demonstrates the skill (sub-agent orchestration + tool selection) without bloating into a "framework". Reviewers reading the source see a focused system, not a kitchen sink. Future growth, if any, is feature-flagged in a v0.2.

---

## ADR-004 — Hosted demo: Option 3 (Vercel + replay fallback + local-with-keys)

**Context.** The repo is public OSS. A SAM.gov API key cannot ship in the repo, but visitors should still be able to run the agent without cloning, registering for keys, and bringing their own credentials.

**Decision.** Three demo paths:
1. **Hosted live** at `grant-pilot.kevinmurphywebdev.com` — server-side keys, hardened with allowlist + budget cap + rate limit
2. **Local replay** (`bun run demo`) — no keys needed, reads `eval/recordings/default.jsonl`
3. **Local live** (`bun run smoke`) — visitor brings their own `ANTHROPIC_API_KEY` + `SAM_GOV_API_KEY`

**Consequences.** Anyone can interact with the agent in <10 seconds (path 1 or 2) without trust-our-binary risk. Path 3 demonstrates the system is fully open. The hosted demo is the headline networking surface; replay protects budget when the cap is hit.

---

## ADR-005 — Daily budget cap: $3/day

**Context.** Hosted demo runs cost ~$0.05–0.07 per intent. Without a cap, a single bad actor or an unexpected LinkedIn share could run a five-figure bill.

**Decision.** Hard cap at `BUDGET_MAX_USD_PER_DAY=3` (~45–60 demo runs/day). When the day's spend exceeds the cap, `/api/run` serves the pre-recorded run for the requested intent with a banner explaining the cap. Cap is tunable via Vercel env without redeploy.

**Consequences.** Worst-case cost is bounded, predictable, and small. Visitors hitting the cap still see a real result (not a 503). The cap is part of the design conversation in DESIGN_NOTES — "production-shaped thinking" rather than "demo will rate-limit you."

---

## ADR-006 — 5-intent allowlist, no free-form input

**Context.** A free-form input box is a prompt-injection liability and an open-ended cost surface.

**Decision.** Hosted demo offers exactly 5 fixed intents (`eval/intents.jsonl`). The same 5 power the eval set and the recording manifest. Any other input is rejected before any model call.

**Consequences.** Eliminates two whole risk classes (prompt injection from strangers, runaway cost from pathological inputs) at the cost of a less-flashy UX. The constraint is also a signal: the project understands what hosted-AI demos actually need to handle.

---

## ADR-007 — Drafter produces scaffolding, not prose

**Context.** "AI writes your grant application" is a marketing-friendly claim and an irresponsible product. Federal grant applications require verifiable claims, applicant-specific voice, and accurate budget figures — all things an LLM will hallucinate.

**Decision.** The drafter sub-agent returns a structured skeleton: section headings, guidance per section, and applicant-prompts (questions the human must answer). Plus a `watchOuts` list of pitfalls grounded in the grant's stated eligibility. It never produces prose claiming things about the applicant's organization.

**Consequences.** The output is honest about what AI is good at (structure, surface-level coverage of program requirements) and what it isn't (writing as the applicant, citing real numbers). Reviewers who care about responsible AI deployment recognize this shape; reviewers who want auto-prose are not the reviewers this project is courting.

---

## ADR-008 — `MIN_SCORE_FOR_ELIGIBILITY = 30` (calibrated)

**Context.** Discovery ranks each candidate 0–100. The planner only spends tokens on eligibility checks for candidates above a threshold.

**Decision.** Initial value 50 was too high — the IA ag co-op intent's top candidate was a real, plausibly-relevant USDA Meat & Poultry Processing Expansion grant scoring 35, and we were skipping eligibility on it. Tightening the discovery prompt (favor 2–4 broad keywords, drop geography from the query) improved score quality across the board. Final threshold 30 catches plausibly-relevant matches while still filtering obvious junk (sub-25 noise).

**Consequences.** All 5 eval intents now produce at least one eligibility check. Calibration history (per-intent score distributions) lives in `docs/memory/eval-calibration.md`. Raising this threshold above 40 requires re-running the eval and updating that memory file.

---

## ADR-009 — `MAX_ELIGIBILITY_CHECKS = 3` (cost ceiling)

**Context.** Each eligibility check pulls full grant detail + optional SAM lookup + a Sonnet call. ~$0.02–0.04 per check.

**Decision.** Cap at 3 per run. The planner ranks candidates and checks the top 3 above the score threshold; lower-ranked candidates are returned in the shortlist as "not checked".

**Consequences.** Per-run cost is predictable (~$0.05–0.07) which makes the daily budget cap meaningful. Visitors still see all 5 candidates in the shortlist; the planner is honest about which it actually verified.

---

## ADR-010 — Single source of truth for intents

**Context.** The eval set, the hosted-demo allowlist, and the recording manifest could each have their own list. They could drift.

**Decision.** `eval/intents.jsonl` drives all three. Loaded by `src/eval/intents.ts` (Zod-validated). The hosted demo's allowlist imports the same file. Recordings are keyed by the same `id` field.

**Consequences.** The demo can never offer an intent the eval doesn't cover; the eval can never drift from the recordings. Adding a new demo intent is a single-line change.
