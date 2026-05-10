/**
 * entity-lookup — SAM.gov Entity API v3 client.
 *
 * Given a UEI (Unique Entity ID) or legal business name, fetch the
 * SAM.gov registration record. Used by the eligibility sub-agent to
 * confirm an applicant is registered to receive federal funds at all
 * — most grants require active SAM.gov registration as a prerequisite.
 *
 * Requires SAM_GOV_API_KEY in env. Without it the tool returns a
 * structured `unauthorized` error and the planner falls back to
 * "registration status unknown" in its final response.
 */

import { z } from "zod";

const ENDPOINT = "https://api.sam.gov/entity-information/v3/entities";
const USER_AGENT = "grant-pilot/0.0.1 (https://github.com/midimurphdesigns/grant-pilot)";

export const EntityLookupInputSchema = z.object({
  uei: z.string().length(12).optional(),
  legalBusinessName: z.string().min(2).max(200).optional(),
}).refine((v) => v.uei !== undefined || v.legalBusinessName !== undefined, {
  message: "either uei or legalBusinessName is required",
});
export type EntityLookupInput = z.infer<typeof EntityLookupInputSchema>;

export const EntityLookupOutputSchema = z.object({
  uei: z.string().nullable(),
  legalBusinessName: z.string().nullable(),
  registrationStatus: z.string().nullable(),
  registrationExpirationDate: z.string().nullable(),
  entityStructure: z.string().nullable(),
  stateOfIncorporation: z.string().nullable(),
  physicalAddressState: z.string().nullable(),
  primaryNaics: z.string().nullable(),
  exclusionStatusFlag: z.string().nullable(),
});
export type EntityLookupOutput = z.infer<typeof EntityLookupOutputSchema>;

export type EntityLookupError =
  | { kind: "unauthorized"; message: string }
  | { kind: "not-found"; query: string }
  | { kind: "rate-limit"; retryAfterMs: number }
  | { kind: "network"; message: string }
  | { kind: "schema"; message: string };

export type EntityLookupResult =
  | { ok: true; data: EntityLookupOutput }
  | { ok: false; error: EntityLookupError };

const RawEntitySchema = z.object({
  totalRecords: z.number().optional(),
  entityData: z
    .array(
      z.object({
        entityRegistration: z
          .object({
            ueiSAM: z.string().nullable().optional(),
            legalBusinessName: z.string().nullable().optional(),
            registrationStatus: z.string().nullable().optional(),
            registrationExpirationDate: z.string().nullable().optional(),
            entityStructureCode: z.string().nullable().optional(),
            stateOfIncorporationCode: z.string().nullable().optional(),
            exclusionStatusFlag: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        coreData: z
          .object({
            entityInformation: z
              .object({
                entityStructureCode: z.string().nullable().optional(),
              })
              .nullable()
              .optional(),
            physicalAddress: z
              .object({
                stateOrProvinceCode: z.string().nullable().optional(),
              })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
        assertions: z
          .object({
            goodsAndServices: z
              .object({
                primaryNaics: z.string().nullable().optional(),
              })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
      }),
    )
    .default([]),
});

export async function entityLookup(raw: unknown): Promise<EntityLookupResult> {
  const parsed = EntityLookupInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: { kind: "schema", message: parsed.error.message } };
  }
  const input = parsed.data;

  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: { kind: "unauthorized", message: "SAM_GOV_API_KEY not set in env" },
    };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  if (input.uei) url.searchParams.set("ueiSAM", input.uei);
  if (input.legalBusinessName) url.searchParams.set("legalBusinessName", input.legalBusinessName);
  url.searchParams.set("samRegistered", "Yes");

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    return {
      ok: false,
      error: { kind: "network", message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      error: { kind: "unauthorized", message: `SAM.gov returned ${resp.status}` },
    };
  }

  if (resp.status === 429) {
    const retryAfter = resp.headers.get("retry-after");
    return {
      ok: false,
      error: {
        kind: "rate-limit",
        retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : 60_000,
      },
    };
  }

  if (!resp.ok) {
    return {
      ok: false,
      error: { kind: "network", message: `SAM.gov returned HTTP ${resp.status}` },
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

  const env = RawEntitySchema.safeParse(json);
  if (!env.success) {
    return { ok: false, error: { kind: "schema", message: env.error.message } };
  }

  const first = env.data.entityData[0];
  if (!first) {
    return {
      ok: false,
      error: {
        kind: "not-found",
        query: input.uei ?? input.legalBusinessName ?? "",
      },
    };
  }

  const reg = first.entityRegistration;
  const out: EntityLookupOutput = {
    uei: reg?.ueiSAM ?? null,
    legalBusinessName: reg?.legalBusinessName ?? null,
    registrationStatus: reg?.registrationStatus ?? null,
    registrationExpirationDate: reg?.registrationExpirationDate ?? null,
    entityStructure: first.coreData?.entityInformation?.entityStructureCode ?? reg?.entityStructureCode ?? null,
    stateOfIncorporation: reg?.stateOfIncorporationCode ?? null,
    physicalAddressState: first.coreData?.physicalAddress?.stateOrProvinceCode ?? null,
    primaryNaics: first.assertions?.goodsAndServices?.primaryNaics ?? null,
    exclusionStatusFlag: reg?.exclusionStatusFlag ?? null,
  };

  return { ok: true, data: out };
}

export const entityLookupToolDef = {
  name: "entity_lookup",
  description:
    "Look up a business or nonprofit's SAM.gov registration record. Confirms the applicant is registered to receive federal funds (a prerequisite for most grants). Returns registration status, expiration, structure, state, and primary NAICS.",
  input_schema: {
    type: "object" as const,
    properties: {
      uei: {
        type: "string",
        description: "12-character SAM.gov Unique Entity ID (preferred)",
      },
      legalBusinessName: {
        type: "string",
        description: "Legal business name (alternative to UEI)",
      },
    },
  },
};
