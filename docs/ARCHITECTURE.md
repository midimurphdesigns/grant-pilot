# Architecture

## One-paragraph summary

`grant-pilot` is a multi-turn agent that helps a small business or nonprofit navigate federal grants. A **planner** decomposes the user's intent and dispatches three **sub-agents** as tools: **discovery** (grants.gov search + ranking), **eligibility** (SAM.gov check + verdict grounded in the grant's eligibility text), and **drafter** (structured application skeleton). Each sub-agent has its own **fallback ladder** (Sonnet 4.6 → Haiku 4.5) so failures degrade rather than crash. The whole run produces a **transcript** of structured steps + provenance (which model answered, latency, cost) that visitors can read alongside the agent's output.

## System diagram

```
User intent + profile
        │
        ▼
┌────────────────────────────────────────────────┐
│  Planner (src/agent/planner.ts)                │
│  - bounded multi-turn loop                     │
│  - never throws; failures become decisions     │
└────┬───────────────┬───────────────┬───────────┘
     │               │               │
     ▼               ▼               ▼
┌──────────┐   ┌──────────────┐   ┌──────────┐
│Discovery │   │ Eligibility  │   │ Drafter  │
│sub-agent │   │ sub-agent    │   │sub-agent │
└────┬─────┘   └──────┬───────┘   └────┬─────┘
     │                │                │
     ▼                ▼                ▼
┌─────────────┐ ┌────────────────┐ ┌──────────────┐
│grants_search│ │ grant_detail + │ │ grant_detail │
│             │ │ entity_lookup  │ │              │
└──────┬──────┘ └────────┬───────┘ └──────┬───────┘
       │                 │                │
       ▼                 ▼                ▼
   grants.gov     grants.gov + SAM.gov   grants.gov
   Search v2      fetchOpportunity +     fetchOpportunity
                  Entity v3
```

## Run flow

1. **Discovery** — derive a grants.gov keyword query from intent + profile (≤ 4 words; geography lives in eligibility, not the keyword index). Run search. Rank candidates 0–100 with one-line rationale per candidate. Return top 5.
2. **Eligibility** — for the top N candidates above `MIN_SCORE_FOR_ELIGIBILITY` (default 30, max 3 checks): fetch full grant detail, optionally check SAM.gov registration if `profile.uei` set, return `pass` / `fail` / `uncertain` verdict with reasons grounded in the eligibility text. Inactive SAM registration is hoisted to a hard blocker regardless of model output.
3. **Drafter** — for the highest-ranked grant that passed (or, if none passed, the highest "uncertain"), produce a structured skeleton: 3–8 sections, each with guidance + applicant-prompts, plus a watch-outs list. Deliberately NOT prose — see DESIGN_NOTES on the no-prose rule.
4. **Compose** — return a `PlannerRun` with all `TranscriptStep`s + a `summary` (shortlist with verdicts and blockers, draft target, total cost, total latency).

## Why three sub-agents, not more

The trio mirrors the real workflow stages a grants consultant runs (find → qualify → write). Adding more (e.g., "budget builder", "compliance reviewer") would be framework creep without commensurate user value at v0.1. Resisting that creep is a deliberate signal — see ADR-003.

## Why a planner, not direct sub-agent calls

A direct CLI could just call discovery → eligibility → drafter in sequence. The planner exists because:
- It enforces the bounded loop (`MAX_ELIGIBILITY_CHECKS`) — protects against runaway cost
- It owns error routing (sub-agent errors become `decision` steps, never thrown exceptions)
- It produces a single composable artifact (`PlannerRun`) the hosted demo and recorder both consume
- It demonstrates the FDE-shape skill the project is meant to prove (sub-agent orchestration + tool selection + failure recovery)

## Fallback ladder

Ported from fedbench. Each `callLadder` call tries Sonnet 4.6; on rate-limit / 5xx / network failure, falls through to Haiku 4.5. 4xx other than 429 surfaces as a real error — that's a bug in our harness, not provider degradation. Each rung carries pricing + latency budget; provenance returned with every response so transcripts can show which rung answered.

Per-sub-agent ladders mean cost ceilings stack predictably: the planner's cost is the sum of its sub-agents' costs, each of which is bounded by its own ladder.

## Eval & recording

`eval/intents.jsonl` is the single source of truth for: the eval set, the hosted-demo allowlist, and the recording manifest. One file means the demo can never offer an intent the eval doesn't cover, and the eval can never drift from the recordings.

`bun run eval:record` runs all 5 intents live, scores each with structural criteria (discovery returned candidates, verdicts grounded with reasons, drafter produced skeleton, total cost ≤ $0.20), and appends to `eval/recordings/default.jsonl`. `bun run demo` (`--replay`) replays from the JSONL with no API key — this is the path strangers run when the hosted demo's daily budget cap is hit.

## Hosted demo (Phase H)

`web/` is a separate Next.js 16 package inside the repo. UI lets visitors pick from the 5 allowlisted intents (no free-form input). `/api/run` is a streaming Route Handler that:
1. Validates the intent against the allowlist (allowlist.ts)
2. Checks per-IP rate limit (Upstash Redis, 5/hr)
3. Checks daily budget cap (Upstash Redis counter, $3/day default)
4. If under cap → runs the planner live, streams transcript steps as they complete
5. If over cap → serves the recording with a banner explaining why

Server-side keys only (`ANTHROPIC_API_KEY`, `SAM_GOV_API_KEY`); never shipped client-side. Public repo never contains keys (`.env` gitignored, `.env.example` documents the shape).
