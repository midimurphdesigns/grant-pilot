"use client";

import * as React from "react";

import { DiscoveryTile } from "./discovery-tile";
import { DiscoveryPartialTile } from "./discovery-partial-tile";
import { EligibilityTile } from "./eligibility-tile";
import { EligibilityPartialTile } from "./eligibility-partial-tile";
import { DrafterTile } from "./drafter-tile";
import { DrafterPartialTile } from "./drafter-partial-tile";
import { DecisionTile } from "./decision-tile";
import { SummaryTile } from "./summary-tile";
import { ErrorTile } from "./error-tile";
import type {
  PartialDiscovery,
  PartialDraft,
  PartialEligibility,
  StepEvent,
} from "@/lib/types";

/**
 * Transcript orchestrator.
 *
 * Three sub-agents stream into the page, each with its own in-flight
 * partial state managed by the parent. The orchestrator renders the
 * settled tiles in the order they arrived as final `step` events, and
 * slots the in-flight partial tiles in at the right position so the
 * timeline reads chronologically:
 *
 *   [discovery partial → discovery final]
 *   [eligibility partial #1 → eligibility final #1]
 *   [eligibility partial #2 → eligibility final #2]
 *   ...
 *   [drafter partial → drafter final]
 *
 * A partial is cleared the moment its corresponding final step event
 * arrives (handled by the parent). The visual swap is seamless.
 */
export function Transcript({
  events,
  partialDraft,
  partialDiscovery,
  partialEligibility,
}: {
  events: StepEvent[];
  partialDraft: { opportunityNumber: string; partial: PartialDraft } | null;
  partialDiscovery: PartialDiscovery | null;
  partialEligibility: Record<string, PartialEligibility>;
}) {
  const stepEvents = events.filter(
    (e): e is Extract<StepEvent, { kind: "step" }> => e.kind === "step",
  );
  const summaryEvent = events.find(
    (e): e is Extract<StepEvent, { kind: "summary" }> => e.kind === "summary",
  );
  const errorEvents = events.filter(
    (e): e is Extract<StepEvent, { kind: "error" }> => e.kind === "error",
  );

  const hasFinalDiscovery = stepEvents.some((e) => e.step.kind === "discovery");
  const hasFinalDrafter = stepEvents.some((e) => e.step.kind === "drafter");
  const finalEligibilityOpps = new Set(
    stepEvents
      .filter((e) => e.step.kind === "eligibility")
      .map((e) => (e.step.kind === "eligibility" ? e.step.opportunityNumber : "")),
  );

  // Surface the in-flight eligibility partials whose final event hasn't
  // landed yet, in insertion order.
  const inFlightEligibility = Object.values(partialEligibility).filter(
    (p) => !finalEligibilityOpps.has(p.opportunityNumber),
  );

  return (
    <div className="space-y-3">
      {stepEvents.map((event, i) => {
        const step = event.step;
        const key = `${step.kind}-${i}`;
        if (step.kind === "discovery") return <DiscoveryTile key={key} step={step} />;
        if (step.kind === "eligibility") return <EligibilityTile key={key} step={step} />;
        if (step.kind === "drafter") return <DrafterTile key={key} step={step} />;
        if (step.kind === "decision") return <DecisionTile key={key} message={step.message} />;
        return null;
      })}
      {partialDiscovery && !hasFinalDiscovery && (
        <DiscoveryPartialTile partial={partialDiscovery} />
      )}
      {inFlightEligibility.map((p) => (
        <EligibilityPartialTile key={`elig-partial-${p.opportunityNumber}`} partial={p} />
      ))}
      {partialDraft && !hasFinalDrafter && (
        <DrafterPartialTile
          opportunityNumber={partialDraft.opportunityNumber}
          partial={partialDraft.partial}
        />
      )}
      {errorEvents.map((e, i) => (
        <ErrorTile key={`error-${i}`} message={e.message} />
      ))}
      {summaryEvent && <SummaryTile summary={summaryEvent.summary} />}
    </div>
  );
}
