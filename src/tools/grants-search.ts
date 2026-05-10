/**
 * grants-search — grants.gov Search API v2 client.
 *
 * Endpoint: https://api.grants.gov/v1/api/search2 (POST, JSON body).
 * Currently public/unauthenticated. We still send a User-Agent so
 * grants.gov can attribute traffic if they ever rate-limit.
 *
 * Returns a Zod-validated, agent-friendly shape — the planner sees a
 * predictable list of candidates regardless of grants.gov's response
 * idiosyncrasies. Errors surface as structured failures the planner
 * can route on (rate-limit / empty-results / network).
 */

import { z } from "zod";

const ENDPOINT = "https://api.grants.gov/v1/api/search2";
const USER_AGENT = "grant-pilot/0.0.1 (https://github.com/midimurphdesigns/grant-pilot)";

export const GrantsSearchInputSchema = z.object({
  /** Free-text keyword — e.g. "infrastructure construction Arizona". */
  keyword: z.string().min(2).max(200),
  /** Filter to currently-open opportunities. */
  oppStatuses: z
    .array(z.enum(["forecasted", "posted", "closed", "archived"]))
    .default(["forecasted", "posted"]),
  /** Max number of opportunities to return (grants.gov caps at 1000). */
  rows: z.number().int().min(1).max(50).default(10),
  /** Optional eligibility-applicant code list (grants.gov AppCFDA codes). */
  eligibilities: z.array(z.string()).optional(),
  /** Optional NAICS / agency filters for downstream tightening. */
  agencies: z.array(z.string()).optional(),
});
export type GrantsSearchInput = z.infer<typeof GrantsSearchInputSchema>;

export const GrantCandidateSchema = z.object({
  opportunityNumber: z.string(),
  title: z.string(),
  agencyName: z.string().nullable(),
  agencyCode: z.string().nullable(),
  openDate: z.string().nullable(),
  closeDate: z.string().nullable(),
  oppStatus: z.string(),
  docType: z.string().nullable(),
});
export type GrantCandidate = z.infer<typeof GrantCandidateSchema>;

export const GrantsSearchOutputSchema = z.object({
  totalHits: z.number(),
  candidates: z.array(GrantCandidateSchema),
});
export type GrantsSearchOutput = z.infer<typeof GrantsSearchOutputSchema>;

export type GrantsSearchError =
  | { kind: "rate-limit"; retryAfterMs: number }
  | { kind: "empty"; query: string }
  | { kind: "network"; message: string }
  | { kind: "schema"; message: string };

export type GrantsSearchResult =
  | { ok: true; data: GrantsSearchOutput }
  | { ok: false; error: GrantsSearchError };

/**
 * grants.gov returns a sprawling envelope with mixed casing. Map only
 * the fields we need into our canonical shape.
 */
const RawGrantsGovResponseSchema = z.object({
  errorcode: z.number().optional(),
  msg: z.string().optional(),
  data: z
    .object({
      hitCount: z.number().optional(),
      oppHits: z
        .array(
          z.object({
            number: z.string(),
            title: z.string(),
            agency: z.string().nullable().optional(),
            agencyCode: z.string().nullable().optional(),
            openDate: z.string().nullable().optional(),
            closeDate: z.string().nullable().optional(),
            oppStatus: z.string(),
            docType: z.string().nullable().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

export async function grantsSearch(
  raw: unknown,
): Promise<GrantsSearchResult> {
  const parsed = GrantsSearchInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: "schema", message: parsed.error.message },
    };
  }
  const input = parsed.data;

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        keyword: input.keyword,
        oppStatuses: input.oppStatuses.join("|"),
        rows: input.rows,
        ...(input.eligibilities ? { eligibilities: input.eligibilities.join("|") } : {}),
        ...(input.agencies ? { agencies: input.agencies.join("|") } : {}),
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: { kind: "network", message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (resp.status === 429) {
    const retryAfter = resp.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 30_000;
    return { ok: false, error: { kind: "rate-limit", retryAfterMs } };
  }

  if (!resp.ok) {
    return {
      ok: false,
      error: { kind: "network", message: `grants.gov returned HTTP ${resp.status}` },
    };
  }

  let json: unknown;
  try {
    json = await resp.json();
  } catch (err) {
    return {
      ok: false,
      error: { kind: "schema", message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` },
    };
  }

  const envelope = RawGrantsGovResponseSchema.safeParse(json);
  if (!envelope.success) {
    return {
      ok: false,
      error: { kind: "schema", message: envelope.error.message },
    };
  }

  if (envelope.data.errorcode && envelope.data.errorcode !== 0) {
    return {
      ok: false,
      error: { kind: "network", message: envelope.data.msg ?? "grants.gov error" },
    };
  }

  const hits = envelope.data.data?.oppHits ?? [];
  const totalHits = envelope.data.data?.hitCount ?? hits.length;

  if (hits.length === 0) {
    return { ok: false, error: { kind: "empty", query: input.keyword } };
  }

  const candidates: GrantCandidate[] = hits.map((h) => ({
    opportunityNumber: h.number,
    title: h.title,
    agencyName: h.agency ?? null,
    agencyCode: h.agencyCode ?? null,
    openDate: h.openDate ?? null,
    closeDate: h.closeDate ?? null,
    oppStatus: h.oppStatus,
    docType: h.docType ?? null,
  }));

  return { ok: true, data: { totalHits, candidates } };
}

/** MCP-style tool definition for the planner's tool registry. */
export const grantsSearchToolDef = {
  name: "grants_search",
  description:
    "Search grants.gov for federal funding opportunities by keyword. Returns ranked candidate grants with opportunity number, title, agency, and dates. Use this to surface candidates before checking eligibility.",
  input_schema: {
    type: "object" as const,
    properties: {
      keyword: { type: "string", description: "Free-text search query" },
      rows: { type: "number", description: "Max results (1-50, default 10)" },
      oppStatuses: {
        type: "array",
        items: { type: "string", enum: ["forecasted", "posted", "closed", "archived"] },
        description: "Opportunity statuses to include (default: forecasted+posted)",
      },
    },
    required: ["keyword"],
  },
};
