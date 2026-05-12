"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BreathingDot } from "@/components/ui/breathing-dot";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ScoreBadge } from "./score-badge";
import type { PartialDiscovery } from "@/lib/types";

/**
 * In-flight Discovery tile.
 *
 * Receives the partial ranking as it streams from `streamObject`. Each
 * candidate spring-fades into view as the model emits its entry; titles
 * and agencies are hydrated server-side from the grants.gov response,
 * so a candidate renders fully the moment its opportunityNumber lands —
 * even before the model has finished writing the rationale.
 *
 * The breathing cyan dot in the header signals the agent is still
 * ranking. Once the planner emits the final discovery step event, the
 * parent Transcript swaps this for the full DiscoveryTile.
 */
export function DiscoveryPartialTile({
  partial,
}: {
  partial: PartialDiscovery;
}) {
  const candidates = partial.candidates ?? [];

  return (
    <Card className="border-[var(--color-primary)]/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Search className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-base font-medium tracking-tight">Discovery</h3>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <BreathingDot />
            <Eyebrow>streaming</Eyebrow>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {partial.query && (
          <div className="space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
              grants.gov query
            </p>
            <code className="inline-block px-2 py-1 text-xs bg-white/[0.04] border border-[var(--color-border)]">
              {partial.query}
            </code>
            {partial.queryRationale && (
              <p className="text-xs text-[var(--color-muted-foreground)] leading-5 italic">
                {partial.queryRationale}
              </p>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {candidates.map((c, i) => {
            if (!c.opportunityNumber) return null;
            return (
              <motion.div
                key={c.opportunityNumber}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 28 }}
                className="grid grid-cols-[auto_1fr] items-start gap-3 border border-[var(--color-border)] p-3"
              >
                {typeof c.score === "number" ? (
                  <ScoreBadge score={c.score} />
                ) : (
                  <div className="size-7 border border-[var(--color-border)] animate-pulse" />
                )}
                <div className="min-w-0">
                  {c.title ? (
                    <p className="text-sm font-medium leading-snug break-words">
                      {decodeHtml(c.title)}
                    </p>
                  ) : (
                    <div className="h-4 w-3/4 bg-white/[0.04] animate-pulse" />
                  )}
                  <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {c.opportunityNumber}
                    {c.agencyName && <> · {c.agencyName}</>}
                    {c.closeDate && <> · closes {c.closeDate}</>}
                  </p>
                  {c.rationale ? (
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)] leading-5">
                      {c.rationale}
                    </p>
                  ) : (
                    <div className="mt-2 h-3 w-full bg-white/[0.04] animate-pulse" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
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
