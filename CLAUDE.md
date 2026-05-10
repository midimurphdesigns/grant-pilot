# CLAUDE.md — grant-pilot

This is the only context a fresh Claude session has on first message. Keep it lean — link to deeper docs in `docs/`.

---

## What this is

`grant-pilot` is an open-source applied-AI portfolio project: an agent that helps a small business or nonprofit discover federal grants they qualify for, then drafts the skeleton of an application. It orchestrates three specialist sub-agents — discovery, eligibility, drafter — over public grants.gov + SAM.gov data.

Third in a trilogy with [fedbench](https://github.com/midimurphdesigns/fedbench) (eval harness) and [fieldops-mcp](https://github.com/midimurphdesigns/fieldops-mcp) (MCP server). This one is the FDE-shape: a multi-turn agent that decomposes intent, dispatches sub-agents as tools, and composes their outputs.

**Audience:** engineering hiring managers and applied-AI practice leaders. The repo is public; assume reviewers will read README, ARCHITECTURE, DESIGN_NOTES, and one or two source files.

**Voice:** plain English, story-led, no marketing fluff. Show the design tradeoffs explicitly.

---

## Stack

- **Bun + TypeScript strict** — same toolchain as fedbench / fieldops-mcp
- **Anthropic SDK** — Sonnet 4.6 primary, Haiku 4.5 fallback (per-sub-agent ladder)
- **Zod** — schema validation at every tool/sub-agent boundary
- **grants.gov Search API v2** — public, unauthenticated
- **SAM.gov Entity API v3** — real integration, requires `SAM_GOV_API_KEY`
- **Hosted demo (Phase H)** — Next.js 16 in `web/`, Vercel, Upstash Redis for budget cap + per-IP rate limit
- **MIT license**, public on GitHub

---

## Where to look

| Question                                  | File                                  |
|-------------------------------------------|---------------------------------------|
| How does the system fit together?         | `docs/ARCHITECTURE.md`                |
| Why was X decided?                        | `docs/DECISIONS.md` (ADR log)         |
| Non-obvious calls that need explanation   | `docs/DESIGN_NOTES.md`                |
| Project memory / lessons learned          | `docs/memory/MEMORY.md` (index)       |
| Founder vs agent task ownership           | `docs/memory/founder-tasks.md`        |
| grants.gov API quirks                     | `docs/memory/grants-gov-quirks.md`    |
| SAM.gov API quirks                        | `docs/memory/sam-gov-quirks.md`       |
| Eval scoring + threshold calibration      | `docs/memory/eval-calibration.md`     |

---

## Repo layout

```
grant-pilot/
├── CLAUDE.md                  # this file
├── README.md                  # story-led, public-facing
├── package.json               # bun scripts: smoke / demo / eval / eval:record / typecheck
├── src/
│   ├── agent/
│   │   ├── planner.ts         # main orchestrator
│   │   └── fallback-ladder.ts # ported from fedbench
│   ├── agents/
│   │   ├── types.ts           # UserProfile, SubAgentEnvelope, helpers
│   │   ├── discovery.ts       # grants.gov keyword + ranking
│   │   ├── eligibility.ts     # grant_detail + SAM check + verdict
│   │   └── drafter.ts         # structured skeleton (sections + prompts)
│   ├── tools/
│   │   ├── grants-search.ts   # POST /v1/api/search2
│   │   ├── grant-detail.ts    # POST /v1/api/fetchOpportunity
│   │   ├── entity-lookup.ts   # GET /entity-information/v3/entities
│   │   └── index.ts           # MCP-style tool registry
│   ├── eval/
│   │   ├── intents.ts         # JSONL loader + Zod
│   │   ├── recording.ts       # append-only JSONL + dedup
│   │   ├── scorer.ts          # structural pass criteria
│   │   ├── render.ts          # plain-text transcript
│   │   └── run.ts             # --replay (no-key) | live | --record
│   └── smoke.ts               # one-shot CLI
├── web/                       # Phase H — Next.js hosted demo (separate package)
├── eval/
│   ├── intents.jsonl          # 5 verified user intents
│   └── recordings/
│       └── default.jsonl      # snapshot for replay path
├── docs/                      # ARCHITECTURE / DECISIONS / DESIGN_NOTES + memory/
└── .github/workflows/ci.yml   # typecheck + bun test
```

---

## Session protocol

1. Read this file, scan `docs/memory/MEMORY.md`, peek at the most recent ADRs in `docs/DECISIONS.md`.
2. Don't parallel-implement — check `src/agents/` and `src/tools/` for an existing pattern before adding a new one.
3. Commit conventionally: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`. One conceptual change per commit.
4. After a non-obvious decision, add an ADR to `docs/DECISIONS.md`.
5. After learning something durable about how the system behaves, append a memory entry under `docs/memory/`.
6. Keep `docs/memory/MEMORY.md` an index — entries live in their own files.

---

## Hard rules

- Never commit `.env` (only `.env.example`)
- Never log secrets or include API keys in error messages
- Never claim "agent does X" in README/blog without a recording that demonstrates X
- Never produce a full prose grant application — drafter returns structured **scaffolding only** (sections + applicant prompts). Grant applications need human voice and verifiable claims; auto-prose is irresponsible
- Never raise `MIN_SCORE_FOR_ELIGIBILITY` above 40 without re-recording the eval set — calibration history is in `docs/memory/eval-calibration.md`
- Hosted demo (`web/`) only accepts inputs from the 5-intent allowlist — no free-form input from strangers (eliminates prompt-injection + open-ended cost risk)
- Daily budget cap is a HARD limit — when exceeded, fall back to recording, never bypass

---

## Status

**v0.0.1** — scaffolding + eval set + recordings landed. Phases A–D complete. Phases E (docs), F (resume + blog post), and H (hosted Vercel demo) pending.

See `docs/DECISIONS.md` for the full decision history and `docs/memory/MEMORY.md` for the lessons-learned index.
