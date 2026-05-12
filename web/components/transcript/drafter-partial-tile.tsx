"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, FileText } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BreathingDot } from "@/components/ui/breathing-dot";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { PartialDraft } from "@/lib/types";

/**
 * In-flight Drafter tile.
 *
 * Receives the partial draft as it streams from `streamObject`. Each
 * section that lands in the partial spring-fades into view; the
 * breathing cyan dot in the header signals the agent is still
 * generating. Once the planner emits the final drafter step event,
 * the parent Transcript swaps this for the full DrafterTile.
 */
export function DrafterPartialTile({
  opportunityNumber,
  partial,
}: {
  opportunityNumber: string;
  partial: PartialDraft;
}) {
  const sections = partial.sections ?? [];

  return (
    <Card className="border-[var(--color-primary)]/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-base font-medium tracking-tight">Drafter</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {opportunityNumber}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <BreathingDot />
            <Eyebrow>streaming</Eyebrow>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {partial.summary && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-sm leading-6 italic text-[var(--color-foreground)] border-l-2 border-[var(--color-primary)]/40 pl-4"
          >
            {partial.summary}
          </motion.p>
        )}

        <AnimatePresence initial={false}>
          {sections.map((s, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 28 }}
              className="border border-[var(--color-border)] p-3 space-y-2"
            >
              {s.heading && (
                <p className="text-sm font-medium tracking-tight">{s.heading}</p>
              )}
              {s.guidance && (
                <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
                  {s.guidance}
                </p>
              )}
              {s.promptsForApplicant && s.promptsForApplicant.length > 0 && (
                <ul className="space-y-1.5">
                  {s.promptsForApplicant.map((p, j) => (
                    <li key={j} className="text-xs leading-5 pl-4 relative">
                      <span
                        aria-hidden
                        className="absolute left-0 top-2 size-1 bg-[var(--color-primary)]/60"
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {partial.watchOuts && partial.watchOuts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="border border-[var(--color-muted-foreground)]/20 p-3"
          >
            <p className="flex items-center gap-1.5 type-eyebrow text-[var(--color-foreground)]">
              <AlertTriangle className="size-3" />
              {partial.watchOuts.length} watch-out
              {partial.watchOuts.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-1.5">
              {partial.watchOuts.map((w, i) => (
                <li key={i} className="text-xs leading-5 pl-4 relative">
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 size-1 bg-[var(--color-foreground)]/40"
                  />
                  {w}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
