"use client";

import * as React from "react";
import { ChevronRight, Search } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { JsonBlock } from "@/components/json-block";
import { ProvenanceLine } from "./provenance-line";
import { ScoreBadge } from "./score-badge";
import type { DiscoveryStep } from "@/lib/types";

export function DiscoveryTile({ step }: { step: DiscoveryStep }) {
  const { result, provenance } = step.envelope;

  if (result.kind === "error") {
    return (
      <Card className="border-red-400/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="size-4 text-red-300" />
            <h3 className="text-sm font-semibold">Discovery — error</h3>
          </div>
          <ProvenanceLine prov={provenance} />
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-200">{result.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (result.kind === "empty") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="size-4 text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Discovery — no candidates</h3>
          </div>
          <ProvenanceLine prov={provenance} />
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>
            Query: <code className="font-mono">&quot;{result.query}&quot;</code> returned zero
            opportunities matching grants.gov&apos;s keyword AND-match.
          </p>
          <p className="text-[var(--color-muted-foreground)]">{result.queryRationale}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Search className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Discovery</h3>
          <Badge variant="muted" className="ml-auto">
            {result.candidates.length} candidate{result.candidates.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <ProvenanceLine prov={provenance} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
            grants.gov query
          </p>
          <code className="inline-block px-2 py-1 text-xs bg-white/[0.04] border border-[var(--color-border)]">
            {result.query}
          </code>
          <p className="text-xs text-[var(--color-muted-foreground)] leading-5 italic">
            {result.queryRationale}
          </p>
        </div>

        <ol className="space-y-2">
          {result.candidates.map((c) => (
            <li
              key={c.opportunityNumber}
              className="grid grid-cols-[auto_1fr] items-start gap-3 border border-[var(--color-border)] p-3"
            >
              <ScoreBadge score={c.score} />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug break-words">
                  {decodeHtml(c.title)}
                </p>
                <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {c.opportunityNumber}
                  {c.agencyName && <> · {c.agencyName}</>}
                  {c.closeDate && <> · closes {c.closeDate}</>}
                </p>
                <p className="mt-2 text-xs text-[var(--color-muted-foreground)] leading-5">
                  {c.rationale}
                </p>
              </div>
            </li>
          ))}
        </ol>

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
