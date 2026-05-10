"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { JsonBlock } from "@/components/json-block";
import { ProvenanceLine } from "./provenance-line";
import type { EligibilityStep } from "@/lib/types";

export function EligibilityTile({ step }: { step: EligibilityStep }) {
  const { result, provenance } = step.envelope;

  if (result.kind === "error") {
    return (
      <Card className="border-red-400/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-red-300" />
            <h3 className="text-sm font-semibold">
              Eligibility — error · {step.opportunityNumber}
            </h3>
          </div>
          <ProvenanceLine prov={provenance} />
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-200">{result.message}</p>
        </CardContent>
      </Card>
    );
  }

  const verdictBadge = {
    pass: <Badge variant="success">PASS</Badge>,
    fail: <Badge variant="destructive">FAIL</Badge>,
    uncertain: <Badge variant="warning">UNCERTAIN</Badge>,
  }[result.verdict];

  const samBadge = !result.samRegistration.checked ? (
    <Badge variant="muted">SAM not checked</Badge>
  ) : result.samRegistration.active ? (
    <Badge variant="success">SAM active</Badge>
  ) : result.samRegistration.active === false ? (
    <Badge variant="destructive">SAM inactive</Badge>
  ) : (
    <Badge variant="warning">SAM unknown</Badge>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Eligibility</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {step.opportunityNumber}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {samBadge}
            {verdictBadge}
          </span>
        </div>
        <ProvenanceLine prov={provenance} />
        {result.title && (
          <p className="text-xs text-[var(--color-muted-foreground)] leading-5">
            {decodeHtml(result.title)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {result.reasons.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Grounded reasons
            </p>
            <ul className="space-y-1.5">
              {result.reasons.map((r, i) => (
                <li
                  key={i}
                  className="text-xs leading-5 text-[var(--color-foreground)] pl-4 relative"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 size-1 bg-[var(--color-primary)]/60"
                  />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.blockers.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {result.blockers.length} hard blocker
              {result.blockers.length === 1 ? "" : "s"}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-1">
                {result.blockers.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {result.notes && (
          <p className="text-xs leading-5 text-[var(--color-muted-foreground)] italic border-l-2 border-[var(--color-primary)]/30 pl-3">
            {result.notes}
          </p>
        )}

        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
          SAM check · {result.samRegistration.message}
        </p>

        <Collapsible>
          <CollapsibleTrigger className="group inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <ChevronRight
              aria-hidden
              className="size-3 transition-transform group-data-[state=open]:rotate-90"
            />
            Show raw payload
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <JsonBlock value={result} maxHeight="20rem" />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}
