"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { BudgetStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BudgetPill({ budget, loading }: { budget: BudgetStatus | null; loading: boolean }) {
  if (loading || !budget) {
    return (
      <div className="mt-5 border border-[var(--color-border)] p-3">
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="mt-2 h-1 w-full" />
        <Skeleton className="mt-2 h-3 w-full" />
      </div>
    );
  }
  if (!budget.configured) return null;

  const pct = budget.capUSD > 0 ? Math.min(100, (budget.spentUSD / budget.capUSD) * 100) : 0;
  const state =
    budget.overCap || pct >= 100
      ? "exhausted"
      : pct >= 80
        ? "warning"
        : pct >= 50
          ? "moderate"
          : "ok";

  const stateLabel: Record<typeof state, string> = {
    ok: "live runs available",
    moderate: "live runs available",
    warning: "approaching daily cap",
    exhausted: "daily cap reached",
  };

  const indicatorClass = {
    ok: "bg-[var(--color-primary)]",
    moderate: "bg-[var(--color-primary)]",
    warning: "bg-yellow-400",
    exhausted: "bg-red-400",
  }[state];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-5 border border-[var(--color-border)] p-3" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <div className="flex items-center gap-1.5">
            <span>Daily budget — {stateLabel[state]}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  aria-label="What is this?"
                >
                  <Info className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="leading-5">
                  Every live agent run costs ~$0.05–0.10. The daily cap protects against runaway
                  cost from public traffic. Counter resets at 00:00 UTC. Per-IP rate limit: 5
                  runs/hour. Over-cap behavior: preset intents serve their recorded run; custom
                  intents return a 503 until reset.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="font-mono text-[var(--color-foreground)]">
            ${budget.spentUSD.toFixed(2)} / ${budget.capUSD.toFixed(2)}
          </span>
        </div>
        <Progress
          value={pct}
          className="mt-2"
          indicatorClassName={cn("transition-all", indicatorClass)}
        />
      </div>
    </TooltipProvider>
  );
}
