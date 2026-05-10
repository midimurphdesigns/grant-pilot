"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, ClipboardCopy, FileText } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { JsonBlock } from "@/components/json-block";
import { ProvenanceLine } from "./provenance-line";
import type { DrafterStep } from "@/lib/types";

export function DrafterTile({ step }: { step: DrafterStep }) {
  const { result, provenance } = step.envelope;

  if (result.kind === "error") {
    return (
      <Card className="border-red-400/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-red-300" />
            <h3 className="text-sm font-semibold">Drafter — error · {step.opportunityNumber}</h3>
          </div>
          <ProvenanceLine prov={provenance} />
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-200">{result.message}</p>
        </CardContent>
      </Card>
    );
  }

  const draft = result; // narrowed: kind === "draft"
  function copyMarkdown() {
    const md = renderMarkdown(draft);
    navigator.clipboard
      .writeText(md)
      .then(() => toast.success("Skeleton copied as Markdown"))
      .catch(() => toast.error("Couldn't copy to clipboard"));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Drafter</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {step.opportunityNumber}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={copyMarkdown}
          >
            <ClipboardCopy className="size-3" />
            Copy Markdown
          </Button>
        </div>
        <ProvenanceLine prov={provenance} />
        {result.title && (
          <p className="text-xs text-[var(--color-muted-foreground)] leading-5">{decodeHtml(result.title)}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 italic text-[var(--color-foreground)] border-l-2 border-[var(--color-primary)]/40 pl-4">
          {result.summary}
        </p>

        <ol className="space-y-2">
          {result.sections.map((s, i) => (
            <li key={i}>
              <Collapsible defaultOpen={i === 0}>
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 border border-[var(--color-border)] p-3 text-left hover:border-white/30">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ChevronRight
                      aria-hidden
                      className="size-3 text-[var(--color-muted-foreground)] transition-transform group-data-[state=open]:rotate-90"
                    />
                    {s.heading}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {s.promptsForApplicant.length} prompt
                    {s.promptsForApplicant.length === 1 ? "" : "s"}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-x border-b border-[var(--color-border)] p-3 space-y-3">
                  <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">{s.guidance}</p>
                  <ul className="space-y-1.5">
                    {s.promptsForApplicant.map((p, j) => (
                      <li
                        key={j}
                        className="text-xs leading-5 pl-4 relative"
                      >
                        <span
                          aria-hidden
                          className="absolute left-0 top-2 size-1 bg-[var(--color-primary)]/60"
                        />
                        {p}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ol>

        {result.watchOuts.length > 0 && (
          <div className="border border-yellow-400/30 bg-yellow-400/5 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-yellow-300">
              <AlertTriangle className="size-3" />
              {result.watchOuts.length} watch-out{result.watchOuts.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-1.5">
              {result.watchOuts.map((w, i) => (
                <li
                  key={i}
                  className="text-xs leading-5 pl-4 relative text-yellow-100"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 size-1 bg-yellow-400/60"
                  />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Collapsible>
          <CollapsibleTrigger className="group inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <ChevronRight
              aria-hidden
              className="size-3 transition-transform group-data-[state=open]:rotate-90"
            />
            Show raw payload
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <JsonBlock value={result} maxHeight="24rem" />
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

type DraftResult = Extract<DrafterStep["envelope"]["result"], { kind: "draft" }>;

function renderMarkdown(d: DraftResult): string {
  const parts: string[] = [];
  parts.push(`# Application skeleton — ${d.opportunityNumber}`);
  if (d.title) parts.push(`> ${d.title}`);
  parts.push("");
  parts.push(`**Summary.** ${d.summary}`);
  parts.push("");
  for (const s of d.sections) {
    parts.push(`## ${s.heading}`);
    parts.push(`_${s.guidance}_`);
    parts.push("");
    parts.push("Prompts for the applicant:");
    for (const p of s.promptsForApplicant) parts.push(`- ${p}`);
    parts.push("");
  }
  if (d.watchOuts.length > 0) {
    parts.push("## Watch-outs");
    for (const w of d.watchOuts) parts.push(`- ${w}`);
  }
  return parts.join("\n");
}
