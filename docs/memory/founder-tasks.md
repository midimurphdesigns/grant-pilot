# Founder vs agent task ownership

Some work in this project requires actions an agent literally cannot perform — registering API keys, creating cloud accounts, pointing DNS. This file is the canonical list so a fresh session knows what to ask the founder for vs what to just do.

## Founder owns (only the founder can do these)

- **SAM.gov API key** — registered at https://sam.gov → Workspace → Account Details → API Keys. Goes in local `.env` as `SAM_GOV_API_KEY` and in Vercel encrypted env for the hosted demo.
- **grants.gov API key** — currently optional (Search v2 is public/unauthenticated). Reserved for future stable-throughput key.
- **Anthropic API key** — paid account; goes in `.env` and Vercel.
- **GitHub repo creation** — empty `grant-pilot` repo on github.com/midimurphdesigns; founder pushed initial commit.
- **Vercel project setup** — import the GitHub repo into Vercel, set root to `web/`, add encrypted env vars (`ANTHROPIC_API_KEY`, `SAM_GOV_API_KEY`, `BUDGET_MAX_USD_PER_DAY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
- **Custom subdomain** — point `grant-pilot.kevinmurphywebdev.com` at the Vercel project.
- **Upstash Redis account** — free tier; used for the daily budget counter + per-IP rate limit. REST URL + token go in Vercel env.
- **Approve content** — final sign-off on the blog post, the LinkedIn talking points, and the resume bullet before publishing.

## Agent owns (just do these)

- All code under `src/` and `web/`
- Docs under `docs/` (ARCHITECTURE, DECISIONS, DESIGN_NOTES, memory entries)
- Eval intents in `eval/intents.jsonl`
- Pre-recorded runs in `eval/recordings/default.jsonl`
- README, CLAUDE.md
- CI workflow under `.github/workflows/`
- Conventional commits + push to `main` (this repo is on the global guard-rails exempt list)
- Adjusting calibration thresholds (with re-record + memory update)

## When in doubt

If a step requires a credential, an account, or a public-facing decision a hiring manager might form a judgment about — pause and ask. Otherwise, just do the work and commit.
