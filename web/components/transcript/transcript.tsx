"use client";

import * as React from "react";

import { DiscoveryTile } from "./discovery-tile";
import { EligibilityTile } from "./eligibility-tile";
import { DrafterTile } from "./drafter-tile";
import { DecisionTile } from "./decision-tile";
import { SummaryTile } from "./summary-tile";
import { ErrorTile } from "./error-tile";
import type { StepEvent } from "@/lib/types";

export function Transcript({ events }: { events: StepEvent[] }) {
  const stepEvents = events.filter(
    (e): e is Extract<StepEvent, { kind: "step" }> => e.kind === "step",
  );
  const summaryEvent = events.find(
    (e): e is Extract<StepEvent, { kind: "summary" }> => e.kind === "summary",
  );
  const errorEvents = events.filter(
    (e): e is Extract<StepEvent, { kind: "error" }> => e.kind === "error",
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
      {errorEvents.map((e, i) => (
        <ErrorTile key={`error-${i}`} message={e.message} />
      ))}
      {summaryEvent && <SummaryTile summary={summaryEvent.summary} />}
    </div>
  );
}
