# SAM.gov API quirks

What we learned from integrating with SAM.gov Entity API v3.

## Auth: API key in query string

Public API key goes on the URL as `?api_key=...`. Yes, query string — not a header. Acquired at https://sam.gov → Workspace → Account Details → API Keys.

## Response shape is deeply nested

The relevant fields for grant eligibility live in three different sub-objects:

- `entityRegistration.registrationStatus` — `"Active"` is the gate. Anything else (Expired, Inactive, Submitted) means the entity cannot currently receive federal funds.
- `entityRegistration.registrationExpirationDate` — ISO date.
- `coreData.physicalAddress.stateOrProvinceCode` — for cross-checking against the user profile's `state`.
- `assertions.goodsAndServices.primaryNaics` — useful for sanity-checking the profile's NAICS.

Our Zod schema parses just what we use; everything else is dropped on parse.

## Registration status is a hard gate, not a soft signal

If a profile contains a UEI, the eligibility sub-agent checks SAM. If the response shows registration is anything but `"Active"`, that fact is **prepended to the verdict's `blockers` array regardless of what the model said about overall eligibility**. Federal grants categorically do not award to unregistered entities.

This is the only place in the system where a deterministic check overrides the model's verdict. It's intentional — see `docs/DESIGN_NOTES.md` "SAM.gov inactive registration is hoisted to a hard blocker."

## Search modes

We use two:
- `ueiSAM=<12-char>` — exact lookup, fastest, used when profile has a UEI
- `legalBusinessName=<name>` — fuzzy lookup, used as a fallback (profile schema accepts either)

`samRegistered=Yes` filter is set on every request to skip non-registered entries from showing up at all.

## Rate limiting

SAM.gov returns `429` with a `Retry-After` header when throttled. Our tool returns a structured `rate-limit` error with `retryAfterMs`. Default fallback is 60s if the header is absent.

## Auth failures are common during development

`401 / 403` happens when the key is missing, expired, or the account hasn't been approved for production traffic yet. Our tool returns a structured `unauthorized` error and the eligibility sub-agent falls back to "registration status unknown" — the verdict can still be `pass` or `uncertain`, just without the SAM gate.
