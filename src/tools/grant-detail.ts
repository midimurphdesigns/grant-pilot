/**
 * grant-detail — grants.gov fetchOpportunity API client.
 *
 * Given an opportunity number (or internal opportunity ID), fetch the
 * full opportunity record so the eligibility + drafter sub-agents can
 * reason over real eligibility text, funding ceilings, and submission
 * windows — not just titles.
 *
 * Endpoint: https://api.grants.gov/v1/api/fetchOpportunity (POST).
 */

import { z } from "zod";

const ENDPOINT = "https://api.grants.gov/v1/api/fetchOpportunity";
const USER_AGENT = "grant-pilot/0.0.1 (https://github.com/midimurphdesigns/grant-pilot)";

export const GrantDetailInputSchema = z.object({
  /** grants.gov internal opportunity ID (preferred). */
  opportunityId: z.union([z.string(), z.number()]).optional(),
  /** Or the public opportunity number from search results. */
  opportunityNumber: z.string().optional(),
}).refine((v) => v.opportunityId !== undefined || v.opportunityNumber !== undefined, {
  message: "either opportunityId or opportunityNumber is required",
});
export type GrantDetailInput = z.infer<typeof GrantDetailInputSchema>;

export const GrantDetailOutputSchema = z.object({
  opportunityNumber: z.string(),
  title: z.string(),
  agencyName: z.string().nullable(),
  description: z.string().nullable(),
  eligibilityText: z.string().nullable(),
  fundingCeilingUSD: z.number().nullable(),
  fundingFloorUSD: z.number().nullable(),
  awardCount: z.number().nullable(),
  closeDate: z.string().nullable(),
  cfda: z.array(z.string()),
  applicantTypes: z.array(z.string()),
});
export type GrantDetailOutput = z.infer<typeof GrantDetailOutputSchema>;

export type GrantDetailError =
  | { kind: "not-found"; query: string }
  | { kind: "rate-limit"; retryAfterMs: number }
  | { kind: "network"; message: string }
  | { kind: "schema"; message: string };

export type GrantDetailResult =
  | { ok: true; data: GrantDetailOutput }
  | { ok: false; error: GrantDetailError };

const RawDetailSchema = z.object({
  errorcode: z.number().optional(),
  msg: z.string().optional(),
  data: z
    .object({
      opportunityNumber: z.string().optional(),
      opportunityTitle: z.string().optional(),
      agencyName: z.string().nullable().optional(),
      synopsis: z
        .object({
          synopsisDesc: z.string().nullable().optional(),
          applicantEligibilityDesc: z.string().nullable().optional(),
          awardCeiling: z.union([z.number(), z.string()]).nullable().optional(),
          awardFloor: z.union([z.number(), z.string()]).nullable().optional(),
          numberOfAwards: z.union([z.number(), z.string()]).nullable().optional(),
          responseDate: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      cfdas: z
        .array(z.object({ cfdaNumber: z.string() }))
        .default([]),
      applicantTypes: z
        .array(z.object({ description: z.string() }))
        .default([]),
    })
    .optional(),
});

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function grantDetail(raw: unknown): Promise<GrantDetailResult> {
  const parsed = GrantDetailInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: { kind: "schema", message: parsed.error.message } };
  }
  const input = parsed.data;

  const body: Record<string, unknown> = {};
  if (input.opportunityId !== undefined) body.opportunityId = input.opportunityId;
  else if (input.opportunityNumber !== undefined) body.opportunityNumber = input.opportunityNumber;

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error: { kind: "network", message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (resp.status === 429) {
    const retryAfter = resp.headers.get("retry-after");
    return {
      ok: false,
      error: {
        kind: "rate-limit",
        retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : 30_000,
      },
    };
  }

  if (resp.status === 404) {
    return {
      ok: false,
      error: {
        kind: "not-found",
        query: String(input.opportunityId ?? input.opportunityNumber ?? ""),
      },
    };
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
      error: { kind: "schema", message: err instanceof Error ? err.message : String(err) },
    };
  }

  const env = RawDetailSchema.safeParse(json);
  if (!env.success) {
    return { ok: false, error: { kind: "schema", message: env.error.message } };
  }

  if (env.data.errorcode && env.data.errorcode !== 0) {
    return {
      ok: false,
      error: { kind: "not-found", query: String(input.opportunityId ?? input.opportunityNumber ?? "") },
    };
  }

  const d = env.data.data;
  if (!d) {
    return {
      ok: false,
      error: { kind: "not-found", query: String(input.opportunityId ?? input.opportunityNumber ?? "") },
    };
  }

  const out: GrantDetailOutput = {
    opportunityNumber: d.opportunityNumber ?? String(input.opportunityNumber ?? ""),
    title: d.opportunityTitle ?? "",
    agencyName: d.agencyName ?? null,
    description: d.synopsis?.synopsisDesc ?? null,
    eligibilityText: d.synopsis?.applicantEligibilityDesc ?? null,
    fundingCeilingUSD: toNum(d.synopsis?.awardCeiling),
    fundingFloorUSD: toNum(d.synopsis?.awardFloor),
    awardCount: toNum(d.synopsis?.numberOfAwards),
    closeDate: d.synopsis?.responseDate ?? null,
    cfda: d.cfdas.map((c) => c.cfdaNumber),
    applicantTypes: d.applicantTypes.map((a) => a.description),
  };

  return { ok: true, data: out };
}

export const grantDetailToolDef = {
  name: "grant_detail",
  description:
    "Fetch the full record for a single grant opportunity (eligibility text, funding ceiling, applicant types, close date). Call this after grants_search returns a candidate the agent wants to evaluate in depth.",
  input_schema: {
    type: "object" as const,
    properties: {
      opportunityNumber: {
        type: "string",
        description: "Public opportunity number from a grants_search hit",
      },
      opportunityId: {
        type: "string",
        description: "grants.gov internal opportunity ID (alternative to opportunityNumber)",
      },
    },
  },
};
