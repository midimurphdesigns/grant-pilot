/**
 * Shared types between API + UI for the hosted demo. Mirrors the
 * shapes emitted by the planner without importing from src/ at the
 * type level (the page is a Client Component; src/ is server-only).
 */

export type PresetIntent = {
  id: string;
  intent: string;
  profile: {
    state: string;
    entityType: string;
    employeeCount: number;
  };
};

export type CustomProfile = {
  naicsCode: string;
  employeeCount: number;
  annualRevenueUSD: number;
  state: string;
  zip: string;
  ownership: {
    womanOwned: boolean;
    veteranOwned: boolean;
    minorityOwned: boolean;
    disadvantaged: boolean;
  };
  entityType: "for-profit" | "nonprofit" | "sole-prop" | "co-op" | "tribal";
  yearsInOperation: number;
  missionDescription?: string;
};

export type DiscoveryCandidate = {
  opportunityNumber: string;
  title: string;
  agencyName: string | null;
  closeDate: string | null;
  score: number;
  rationale: string;
};

export type DiscoveryStep = {
  kind: "discovery";
  envelope: {
    result:
      | {
          kind: "candidates";
          query: string;
          queryRationale: string;
          candidates: DiscoveryCandidate[];
        }
      | { kind: "empty"; query: string; queryRationale: string }
      | { kind: "error"; message: string };
    provenance: Provenance;
  };
};

export type EligibilityVerdict = "pass" | "fail" | "uncertain";

export type EligibilityStep = {
  kind: "eligibility";
  opportunityNumber: string;
  envelope: {
    result:
      | {
          kind: "verdict";
          opportunityNumber: string;
          title: string;
          verdict: EligibilityVerdict;
          reasons: string[];
          blockers: string[];
          notes: string;
          samRegistration: {
            checked: boolean;
            active: boolean | null;
            message: string;
          };
        }
      | { kind: "error"; message: string };
    provenance: Provenance;
  };
};

export type DrafterStep = {
  kind: "drafter";
  opportunityNumber: string;
  envelope: {
    result:
      | {
          kind: "draft";
          opportunityNumber: string;
          title: string;
          summary: string;
          sections: {
            heading: string;
            guidance: string;
            promptsForApplicant: string[];
          }[];
          watchOuts: string[];
        }
      | { kind: "error"; message: string };
    provenance: Provenance;
  };
};

export type DecisionStep = {
  kind: "decision";
  message: string;
};

export type AnyStep = DiscoveryStep | EligibilityStep | DrafterStep | DecisionStep;

export type Provenance = {
  rung: string;
  model: string;
  latencyMs: number;
  costUSD: number;
  attempts: { rung: string; error: string }[];
};

export type Summary = {
  intent: string;
  shortlist: {
    opportunityNumber: string;
    title: string;
    score: number;
    verdict: EligibilityVerdict | "not-checked";
    blockers: string[];
  }[];
  draftFor: string | null;
  totalCostUSD: number;
  totalLatencyMs: number;
};

/**
 * In-flight shape of the Drafter sub-agent's output as it streams.
 * Mirrors `PartialDraft` from src/agents/drafter.ts — every field
 * optional because the model emits them progressively.
 */
export type PartialDraft = {
  summary?: string;
  sections?: {
    heading?: string;
    guidance?: string;
    promptsForApplicant?: string[];
  }[];
  watchOuts?: string[];
};

/**
 * In-flight shape of the Discovery sub-agent's ranking step. The
 * ranking `streamObject` emits ranked entries one at a time; titles
 * and agencies are hydrated server-side from the grants.gov response.
 * Mirrors `PartialDiscovery` from src/agents/discovery.ts.
 */
export type PartialDiscovery = {
  query: string;
  queryRationale: string;
  candidates: {
    opportunityNumber?: string;
    title?: string;
    agencyName?: string | null;
    closeDate?: string | null;
    score?: number;
    rationale?: string;
  }[];
};

/**
 * In-flight shape of the Eligibility sub-agent's verdict step. The
 * verdict typically settles in ~50 tokens, so the UI can render the
 * pass/fail/uncertain badge almost immediately and stream reasons +
 * blockers in below.
 */
export type PartialEligibility = {
  opportunityNumber: string;
  title: string;
  verdict?: "pass" | "fail" | "uncertain";
  reasons?: string[];
  blockers?: string[];
  notes?: string;
  samRegistration: {
    checked: boolean;
    active: boolean | null;
    message: string;
  };
};

export type StepEvent =
  | { kind: "meta"; mode: "live" | "replay"; intent: PresetIntent; isCustom?: boolean }
  | { kind: "phase"; phase: "discovery" | "eligibility" | "drafter" }
  | { kind: "step"; step: AnyStep }
  | { kind: "discovery-partial"; partial: PartialDiscovery }
  | { kind: "eligibility-partial"; opportunityNumber: string; partial: PartialEligibility }
  | { kind: "draft-partial"; opportunityNumber: string; partial: PartialDraft }
  | { kind: "summary"; summary: Summary }
  | { kind: "error"; message: string };

export type BudgetStatus = {
  spentUSD: number;
  capUSD: number;
  remainingUSD: number;
  overCap: boolean;
  configured: boolean;
};

export type RunMode = "preset" | "custom";

export type Phase = "starting" | "discovery" | "eligibility" | "drafter" | "summarizing";

export type RunState =
  | { status: "idle" }
  | {
      status: "running";
      mode: RunMode;
      presetId: string | null;
      phase: Phase;
      startedAt: number;
    }
  | {
      status: "done";
      mode: RunMode;
      presetId: string | null;
      durationMs: number;
      cost?: number;
    }
  | {
      status: "error";
      mode: RunMode;
      presetId: string | null;
      message: string;
    };

export const PRESETS: PresetIntent[] = [
  {
    id: "az-construction",
    intent:
      "I run a 12-person construction firm in Arizona. What infrastructure-related federal grants might fit?",
    profile: { state: "AZ", entityType: "for-profit", employeeCount: 12 },
  },
  {
    id: "vt-nonprofit-workforce",
    intent:
      "I'm a 3-person nonprofit in rural Vermont focused on workforce training. Where should I look?",
    profile: { state: "VT", entityType: "nonprofit", employeeCount: 3 },
  },
  {
    id: "tx-cyber-woman-owned",
    intent:
      "My woman-owned cybersecurity consultancy in Texas has 8 employees and $1.2M revenue. Any SBA innovation grants?",
    profile: { state: "TX", entityType: "for-profit", employeeCount: 8 },
  },
  {
    id: "oh-veteran-mfg",
    intent:
      "I'm a veteran-owned manufacturing startup in Ohio, 18 months old, 5 employees. What's available?",
    profile: { state: "OH", entityType: "for-profit", employeeCount: 5 },
  },
  {
    id: "ia-ag-coop",
    intent:
      "I run a 25-person agricultural co-op in Iowa. Are there USDA grants for equipment modernization?",
    profile: { state: "IA", entityType: "co-op", employeeCount: 25 },
  },
];

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export const DEFAULT_CUSTOM_PROFILE: CustomProfile = {
  naicsCode: "541512",
  employeeCount: 8,
  annualRevenueUSD: 750_000,
  state: "CA",
  zip: "94110",
  ownership: {
    womanOwned: false,
    veteranOwned: false,
    minorityOwned: false,
    disadvantaged: false,
  },
  entityType: "for-profit",
  yearsInOperation: 3,
  missionDescription: "",
};

export const CUSTOM_INTENT_MIN_CHARS = 20;
export const CUSTOM_INTENT_MAX_CHARS = 600;
export const CUSTOM_MISSION_MAX_CHARS = 400;
