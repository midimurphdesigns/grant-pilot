# grant-pilot

An agent that helps a small business or nonprofit find federal grants they qualify for, and drafts the skeleton of an application — orchestrating three specialist sub-agents (discovery, eligibility, drafter) over public grants.gov and SAM.gov data.

Third in a trilogy with [fedbench](https://github.com/midimurphdesigns/fedbench) (eval harness) and [fieldops-mcp](https://github.com/midimurphdesigns/fieldops-mcp) (MCP server). This one is the orchestration shape: a multi-turn agent that decomposes intent, dispatches sub-agents as tools, and composes their outputs into a transcript a human can read.

---

## Why this exists

Federal grants are a large, real source of capital for small businesses and nonprofits. The discovery experience is also genuinely awful: grants.gov returns hundreds of programs against a keyword query, the eligibility text on each is dense, and most are wrong for any given applicant. A consultant who knows the workflow can shortlist in minutes; a small business owner reading on their own can lose a weekend.

This project is what the workflow looks like as a multi-turn agent. Three sub-agents do the three things a consultant does — find candidates, qualify them, sketch a draft — each grounded in real APIs (grants.gov for opportunities, SAM.gov for registration status). The agent doesn't write the application itself; it produces structure the applicant fills in.

It's also a portfolio piece. The shape — planner + sub-agents + tool calls + fallback ladders + recording layer — is the shape Forward Deployed and Applied AI engineers ship. Reading the source should make that legible.

---

## Three ways to run it

| Path | Needs | Time |
|------|-------|------|
| **Hosted demo** at `grant-pilot.kevinmurphywebdev.com` | nothing | ~15s live, ~1s on replay |
| **Local replay** (`bun run demo`) | this repo cloned | ~1s |
| **Local live** (`bun run smoke` / `bun run eval`) | `ANTHROPIC_API_KEY` + `SAM_GOV_API_KEY` in `.env` | ~10–60s per intent |

Hosted is the path most visitors will take. Local replay is for anyone who wants to read the recorded transcript without touching keys. Local live is for anyone who wants to run their own intent.

---

## What a run looks like

Intent: *"I run a 12-person construction firm in Arizona. What infrastructure-related federal grants might fit?"*

The planner runs three stages and emits a transcript with provenance per step:

```
[discovery]   primary/claude-sonnet-4-6 · 8.7s · $0.0116
  query:     "infrastructure construction"
  rationale: Two distinctive nouns from the intent. Geography filtered at eligibility, not in the keyword index.
  candidates:
     52  PWEAA2023      — FY 2025 EDA Public Works and Economic Adjustment Assistance
     45  DHS-25-MT-047  — FEMA Building Resilient Infrastructure and Communities (BRIC)
     38  GR-RDC-25-001  — RESTORE Act Direct Component, Construction & Real Property
     35  HE125426R5001  — Military-Connected Schools Construction
     30  VA-GRANTS-...  — State Veterans Home Construction Grant Program

[eligibility] PWEAA2023 · primary/claude-sonnet-4-6 · 6.2s · $0.0188
  verdict: UNCERTAIN
  - For-profit construction firms are eligible co-applicants on EDA Public Works projects, but not lead applicants.
  - The applicant's NAICS 236220 and Phoenix-metro location are within the program's catchment.
  ! blocker: No active SAM.gov registration in profile (UEI not provided).

[decision] Drafting for PWEAA2023 — best uncertain match in shortlist.

[drafter]    PWEAA2023 · primary/claude-sonnet-4-6 · 38.6s · $0.0278
  summary: Phoenix-based commercial general contractor seeking partnership-track participation in EDA Public Works...
  sections:
    # Statement of Need
      ↳ What infrastructure problem in the Phoenix metro does this address...
    # Project Approach
      ↳ Construction activities, sequence, Davis-Bacon compliance plan...
    # Organizational Capability
      ↳ License, completed projects, backlog, project-manager credentials...
    # Budget Narrative
      ↳ Line-item, Davis-Bacon wage rates for Maricopa County...
    # Outcomes & Evaluation
      ↳ Outputs, longer-term outcomes, reporting plan...
  watch-outs:
    ! For-profit construction firms must apply through a state/local lead applicant — confirm partnership before further investment.
    ! SAM.gov registration must be active at submission AND throughout the period of performance.
    ! Davis-Bacon prevailing wage compliance is mandatory on federally-funded construction.
```

Total cost for that run: $0.05. Total wall time: ~66s. The hosted demo replays this in about a second when the daily budget cap is hit; live runs reproduce it from scratch.

---

## How it's built

### Planner → three sub-agents → three tools

```
intent + profile
   │
   ▼
planner (bounded multi-turn loop)
   ├─→ discovery   →  grants_search (grants.gov)
   ├─→ eligibility →  grant_detail + entity_lookup (grants.gov + SAM.gov)
   └─→ drafter     →  grant_detail
   │
   ▼
PlannerRun = { steps: TranscriptStep[], summary }
```

Three sub-agents, deliberately. Adding more would be framework creep without commensurate user value at v0.1. The cap itself is the signal — see [`docs/DECISIONS.md`](docs/DECISIONS.md) ADR-003.

### Per-sub-agent fallback ladder

Each sub-agent's model calls go through `callLadder` (Sonnet 4.6 → Haiku 4.5). On rate-limit / 5xx / network failure, it falls through; 4xx other than 429 surfaces as a real error (that's a bug in our harness, not provider degradation). Provenance — which rung answered, latency, cost — comes back with every response and shows up in the transcript. Ported from fedbench.

### Structured failures, not exceptions

The planner never throws. Sub-agent failures, search-API errors, JSON parse failures all become `TranscriptStep` entries the renderer and the recorder both consume. This is what production-shape agent code looks like.

### SAM.gov is a hard gate

If the user profile contains a UEI, the eligibility sub-agent checks SAM.gov registration status. If the registration is anything other than active, that fact is **prepended to the verdict's blockers regardless of what the model said**. Federal grants categorically do not award to unregistered entities — letting the model decide that creates a path where a model returns `pass` despite a fatal disqualifier. The hoist makes the constraint structural.

### Drafter returns scaffolding, not prose

The drafter sub-agent emits section headings + per-section guidance + applicant-prompts (questions the human must answer) + a watch-outs list. It never produces prose claiming things about the applicant's organization. Federal grant applications need verifiable claims and applicant-specific voice; auto-prose is the wrong product. See [`docs/DECISIONS.md`](docs/DECISIONS.md) ADR-007.

### Single source of truth for intents

`eval/intents.jsonl` powers three things at once: the eval set, the hosted-demo allowlist, and the recording manifest. Adding a new demo intent is a one-line change. The demo can never offer an intent the eval doesn't cover.

### Hosted-demo guardrails

The hosted demo (Phase H, in `web/`) accepts only the 5 fixed allowlisted intents — no free-form input from strangers. A daily budget cap (`BUDGET_MAX_USD_PER_DAY=3` by default) and a per-IP rate limit (5 runs/hour) protect against runaway cost. When the cap is hit, the demo gracefully falls back to the recorded run for the requested intent with a banner explaining why.

---

## Stack

- **Bun** + **TypeScript strict** (no `any`)
- **Anthropic SDK** — Sonnet 4.6 primary, Haiku 4.5 fallback
- **Zod** at every external boundary
- **grants.gov Search v2 + fetchOpportunity** (public, unauthenticated)
- **SAM.gov Entity API v3** (real integration, requires `SAM_GOV_API_KEY`)
- **Next.js 16 + Vercel + Upstash Redis** for the hosted demo (Phase H)
- **MIT** licensed

---

## Repo layout

See [`CLAUDE.md`](CLAUDE.md) for the file-by-file map. The short version:

- `src/agent/` — planner + fallback ladder
- `src/agents/` — three sub-agents
- `src/tools/` — three Zod-validated tool clients + MCP-style registry
- `src/eval/` — intent loader, recording layer, scorer, runner
- `eval/` — JSONL intents and recorded runs
- `web/` — hosted-demo Next.js app (Phase H)
- `docs/` — ARCHITECTURE, DECISIONS (ADR log), DESIGN_NOTES, memory entries

---

## Status

**v0.0.1.** Phases A–E (scaffolding through docs and CI) complete. Phase H (hosted demo) and Phase F (resume + blog post) are tracked separately.

`bun run typecheck` — clean. `bun run demo` — replays five intents from the recording. `bun run eval` — re-runs live and re-scores. CI runs typecheck + the no-key replay path on every push.

---

## License

MIT.
