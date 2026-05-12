"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CUSTOM_INTENT_MAX_CHARS,
  CUSTOM_INTENT_MIN_CHARS,
  CUSTOM_MISSION_MAX_CHARS,
  US_STATES,
  type CustomProfile,
} from "@/lib/types";

type Errors = Partial<Record<"intent" | "naicsCode" | "zip", string>>;

const ENTITY_TYPES: Array<[CustomProfile["entityType"], string]> = [
  ["for-profit", "For-profit"],
  ["nonprofit", "Nonprofit"],
  ["sole-prop", "Sole proprietorship"],
  ["co-op", "Cooperative"],
  ["tribal", "Tribal entity"],
];

/**
 * Prefill examples — three real-shaped starting points the visitor
 * can tweak instead of filling the whole form from scratch. Mirrors
 * three of the eval-set preset intents intentionally; this is a UX
 * affordance, not data of record.
 */
type PrefillExample = {
  id: string;
  label: string;
  intent: string;
  profile: CustomProfile;
};

const PREFILL_EXAMPLES: PrefillExample[] = [
  {
    id: "az-construction",
    label: "AZ construction firm",
    intent:
      "I run a 12-person construction firm in Arizona. What infrastructure-related federal grants might fit?",
    profile: {
      naicsCode: "236220",
      employeeCount: 12,
      annualRevenueUSD: 2_400_000,
      state: "AZ",
      zip: "85004",
      ownership: {
        womanOwned: false,
        veteranOwned: false,
        minorityOwned: false,
        disadvantaged: false,
      },
      entityType: "for-profit",
      yearsInOperation: 6,
      missionDescription:
        "General contracting focused on small-to-mid commercial infrastructure work across the Phoenix metro area.",
    },
  },
  {
    id: "vt-nonprofit",
    label: "VT workforce nonprofit",
    intent:
      "Our 9-person nonprofit in Vermont runs job training for young adults aging out of foster care. Looking for workforce-development grants.",
    profile: {
      naicsCode: "611430",
      employeeCount: 9,
      annualRevenueUSD: 850_000,
      state: "VT",
      zip: "05401",
      ownership: {
        womanOwned: false,
        veteranOwned: false,
        minorityOwned: false,
        disadvantaged: false,
      },
      entityType: "nonprofit",
      yearsInOperation: 11,
      missionDescription:
        "Provides paid 12-week vocational training cohorts to 18-24 year olds transitioning out of foster care, with wraparound case management and employer placement.",
    },
  },
  {
    id: "tx-cyber",
    label: "TX woman-owned cyber consultancy",
    intent:
      "My woman-owned cybersecurity consultancy in Texas has 8 employees and $1.2M revenue. Any SBA innovation grants?",
    profile: {
      naicsCode: "541512",
      employeeCount: 8,
      annualRevenueUSD: 1_200_000,
      state: "TX",
      zip: "75201",
      ownership: {
        womanOwned: true,
        veteranOwned: false,
        minorityOwned: false,
        disadvantaged: false,
      },
      entityType: "for-profit",
      yearsInOperation: 4,
      missionDescription:
        "Cybersecurity advisory and penetration-testing services for mid-market enterprises, with a research interest in supply-chain attack detection.",
    },
  },
];

export function CustomForm({
  intent,
  profile,
  onIntentChange,
  onProfileChange,
  onRun,
  disabled,
  errors,
  hasRun,
  onClear,
}: {
  intent: string;
  profile: CustomProfile;
  onIntentChange: (s: string) => void;
  onProfileChange: (p: CustomProfile) => void;
  onRun: () => void;
  disabled: boolean;
  errors: Errors;
  hasRun: boolean;
  onClear: () => void;
}) {
  const intentRemaining = CUSTOM_INTENT_MAX_CHARS - intent.length;
  const missionRemaining = CUSTOM_MISSION_MAX_CHARS - (profile.missionDescription?.length ?? 0);
  const intentValid = intent.trim().length >= CUSTOM_INTENT_MIN_CHARS;

  function prefill(example: PrefillExample) {
    onIntentChange(example.intent);
    onProfileChange(example.profile);
  }

  return (
    <fieldset disabled={disabled} className={disabled ? "opacity-60" : ""}>
      <div className="space-y-6">
        {/* Prefill bar — three real-shaped starting points the visitor
            can tweak. Reduces the cold-start of "fill out 9 fields
            from scratch" to "pick one, edit what's different." */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-4">
          <span className="type-eyebrow text-[var(--color-muted-foreground)] mr-1">
            Prefill with
          </span>
          {PREFILL_EXAMPLES.map((ex) => (
            <Button
              key={ex.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => prefill(ex)}
              disabled={disabled}
              className="text-xs"
            >
              {ex.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="custom-intent">Describe your funding need</Label>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {intentRemaining} chars left
            </span>
          </div>
          <Textarea
            id="custom-intent"
            value={intent}
            onChange={(e) => onIntentChange(e.target.value)}
            maxLength={CUSTOM_INTENT_MAX_CHARS}
            rows={3}
            placeholder="e.g. I run a 6-person community theater in Maine looking for arts-and-culture grants under $50K."
            aria-invalid={!!errors.intent}
            aria-describedby={errors.intent ? "intent-error" : "intent-help"}
          />
          <p
            id="intent-help"
            className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]"
          >
            {intent.length < CUSTOM_INTENT_MIN_CHARS
              ? `${CUSTOM_INTENT_MIN_CHARS - intent.length} more characters needed`
              : "Looks good"}
          </p>
          {errors.intent && (
            <p id="intent-error" className="text-xs text-red-300">
              {errors.intent}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Your organization
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="entity-type">Entity type</Label>
              <Select
                value={profile.entityType}
                onValueChange={(v) =>
                  onProfileChange({ ...profile, entityType: v as CustomProfile["entityType"] })
                }
              >
                <SelectTrigger id="entity-type" disabled={disabled}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="state">State</Label>
              <Select
                value={profile.state}
                onValueChange={(v) => onProfileChange({ ...profile, state: v })}
              >
                <SelectTrigger id="state" disabled={disabled}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="zip">ZIP — 5 digits</Label>
              <Input
                id="zip"
                type="text"
                inputMode="numeric"
                pattern="\d{5}"
                value={profile.zip}
                onChange={(e) =>
                  onProfileChange({
                    ...profile,
                    zip: e.target.value.replace(/\D/g, "").slice(0, 5),
                  })
                }
                aria-invalid={!!errors.zip}
              />
              {errors.zip && <p className="text-xs text-red-300">{errors.zip}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="naics">NAICS — 2–6 digits</Label>
              <Input
                id="naics"
                type="text"
                inputMode="numeric"
                pattern="\d{2,6}"
                value={profile.naicsCode}
                onChange={(e) =>
                  onProfileChange({
                    ...profile,
                    naicsCode: e.target.value.replace(/\D/g, "").slice(0, 6),
                  })
                }
                aria-invalid={!!errors.naicsCode}
              />
              {errors.naicsCode && <p className="text-xs text-red-300">{errors.naicsCode}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="employees">Employees</Label>
              <Input
                id="employees"
                type="number"
                min={1}
                max={10000}
                value={profile.employeeCount}
                onChange={(e) =>
                  onProfileChange({
                    ...profile,
                    employeeCount: clamp(Number(e.target.value) || 1, 1, 10000),
                  })
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="revenue">Annual revenue (USD)</Label>
              <Input
                id="revenue"
                type="number"
                min={0}
                max={1_000_000_000}
                step={1000}
                value={profile.annualRevenueUSD}
                onChange={(e) =>
                  onProfileChange({
                    ...profile,
                    annualRevenueUSD: clamp(Number(e.target.value) || 0, 0, 1_000_000_000),
                  })
                }
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="years">Years in operation</Label>
              <Input
                id="years"
                type="number"
                min={0}
                max={200}
                step={0.5}
                value={profile.yearsInOperation}
                onChange={(e) =>
                  onProfileChange({
                    ...profile,
                    yearsInOperation: clamp(Number(e.target.value) || 0, 0, 200),
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Ownership designations
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["womanOwned", "Woman-owned"],
                  ["veteranOwned", "Veteran-owned"],
                  ["minorityOwned", "Minority-owned"],
                  ["disadvantaged", "Disadvantaged"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-xs cursor-pointer p-2 border border-[var(--color-border)] hover:border-white/30 transition-colors"
                >
                  <Checkbox
                    checked={profile.ownership[key]}
                    onCheckedChange={(v) =>
                      onProfileChange({
                        ...profile,
                        ownership: { ...profile.ownership, [key]: !!v },
                      })
                    }
                    disabled={disabled}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="mission">Mission description (optional)</Label>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {missionRemaining} chars left
            </span>
          </div>
          <Textarea
            id="mission"
            value={profile.missionDescription ?? ""}
            onChange={(e) =>
              onProfileChange({
                ...profile,
                missionDescription: e.target.value.slice(0, CUSTOM_MISSION_MAX_CHARS),
              })
            }
            maxLength={CUSTOM_MISSION_MAX_CHARS}
            rows={2}
            placeholder="e.g. 501(c)(3) community theater producing 4 mainstage shows per season in rural Maine."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="accent"
            onClick={onRun}
            disabled={disabled || !intentValid}
          >
            {hasRun ? "Run again" : "Run custom intent"}
          </Button>
          {hasRun && (
            <Button type="button" variant="outline" onClick={onClear} disabled={disabled}>
              Clear output
            </Button>
          )}
        </div>

        <Collapsible>
          <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <Info aria-hidden className="size-3" />
            How is this safe to expose publicly?
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Alert>
              <AlertDescription className="space-y-2 leading-5">
                <p>
                  Every structured field is bounded — enums (entity type, state), regex-validated
                  digit strings (NAICS, ZIP), integer ranges (headcount, revenue), booleans
                  (ownership). There&apos;s no injection surface in any of them.
                </p>
                <p>
                  The two free-text fields (intent and mission description) are length-capped (600
                  / 400 chars) and run through a heuristic filter that rejects common jailbreak
                  phrases before any model call.
                </p>
                <p>
                  Per-IP rate limit (5/hr) and a daily budget cap protect against runaway cost.
                  When the cap is hit, custom mode returns 503; preset intents fall back to
                  recordings.
                </p>
              </AlertDescription>
            </Alert>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </fieldset>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
