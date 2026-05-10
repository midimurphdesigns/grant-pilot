# grants.gov API quirks

What we learned from integrating with grants.gov Search v2 + fetchOpportunity.

## Strict AND-match keyword index

The `keyword` field on `/v1/api/search2` AND-matches every term against opportunity titles + synopsis. Long queries return zero hits.

Concrete: `"commercial construction infrastructure small contractor Arizona Phoenix metro"` returned 5 totally-irrelevant opportunities. `"infrastructure construction"` returned 5 plausibly-relevant ones (EDA Public Works, FEMA BRIC, RESTORE Act, military schools, VA construction).

The discovery sub-agent's prompt enforces 2–4 broad terms and explicitly drops geography from the keyword (state filtering happens at eligibility time, not in the keyword index).

## Auth: none required (yet)

Search v2 and fetchOpportunity are public/unauthenticated as of the time this project was built. We send a `User-Agent` so grants.gov can attribute traffic if they ever turn on rate-limiting. `GRANTS_GOV_API_KEY` is reserved in `.env.example` for future use.

## Response shape

Both endpoints return a sprawling envelope with mixed casing. Our Zod schemas (`RawGrantsGovResponseSchema`, `RawDetailSchema`) parse only the fields we actually consume and let the rest pass through as `unknown`.

Funding fields (`awardCeiling`, `awardFloor`, `numberOfAwards`) come back as numbers OR strings, sometimes with currency symbols/commas. The `toNum` helper in `grant-detail.ts` strips non-numeric chars before parsing.

## Status filter

`oppStatuses` accepts `forecasted | posted | closed | archived`, joined by `|` (pipe) in the request body. Default is `forecasted+posted` — currently-open opportunities. Closed/archived are useful for backfilling recordings against grants that have since closed but that's not the v0.1 path.

## Pagination

`rows` parameter caps at 50 in our schema (the API itself goes higher). Discovery only ever asks for 10 — ranking 50 is wasteful when most are irrelevant.

## Rate limiting

We've never seen 429 from grants.gov in testing. The grants-search and grant-detail tools both handle it (parse `Retry-After`, return structured `rate-limit` error) so the planner can route on it if it appears.
