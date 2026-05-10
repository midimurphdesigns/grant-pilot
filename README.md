# grant-pilot

An agent that helps a small business or nonprofit discover federal grants they qualify for, then drafts the skeleton of an application — orchestrating three specialist sub-agents (discovery, eligibility, drafter) over public grants.gov + SAM.gov data.

Third in a trilogy with [fedbench](https://github.com/midimurphdesigns/fedbench) (eval harness) and [fieldops-mcp](https://github.com/midimurphdesigns/fieldops-mcp) (MCP server). This one is the FDE-shape: a multi-turn agent that decomposes intent, dispatches sub-agents as tools, and composes their outputs.

## What it demonstrates

- **Sub-agent orchestration** — a planner agent dispatches work to discovery / eligibility / drafter sub-agents and composes their structured responses.
- **Agent tool use, end-to-end** — the planner picks tool order, recovers from rate-limits and ambiguous results, runs multi-turn until the task completes.
- **RAG** over fetched grant text + agency context.
- **Per-sub-agent fallback ladder** (Sonnet 4.6 → Haiku 4.5), ported from fedbench.
- **Recording / replay** so the public demo runs in ~1s with no API key.

## Three ways to run

| Path | Needs |
|------|-------|
| **Hosted demo** at `grant-pilot.kevinmurphywebdev.com` | nothing — pick one of 5 demo intents and watch the agent work |
| **Local replay** (`bun run demo`) | this repo cloned, no API keys |
| **Local live** (`bun run smoke`) | `ANTHROPIC_API_KEY` + `SAM_GOV_API_KEY` in `.env` |

## Status

`v0.0.1` — scaffolding. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full plan and [docs/DESIGN_NOTES.md](docs/DESIGN_NOTES.md) for non-obvious decisions.

## License

MIT.
