# Memory index

Index file. Each entry lives in its own file under `docs/memory/`. Add new entries by appending one line here.

- [Founder vs agent task ownership](founder-tasks.md) — what Kevin owns (keys, accounts, subdomain) vs what agents own (code, docs, recordings)
- [grants.gov API quirks](grants-gov-quirks.md) — strict AND-match keyword index, response shape, rate-limit envelope
- [SAM.gov API quirks](sam-gov-quirks.md) — auth shape, response envelope, registration-status semantics
- [Eval threshold calibration](eval-calibration.md) — per-intent score distributions; reasoning behind `MIN_SCORE_FOR_ELIGIBILITY = 30`
- [Sub-agent envelope contract](sub-agent-envelope.md) — every sub-agent returns `{ result, provenance }`; how the planner composes transcripts from this
- [Project trilogy context](trilogy-context.md) — relationship to fedbench and fieldops-mcp; what each project is for
