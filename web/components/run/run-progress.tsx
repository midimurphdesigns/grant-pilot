"use client";

import * as React from "react";
import { Check, Loader2, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Phase, RunState } from "@/lib/types";

const PHASE_ORDER: Phase[] = ["starting", "discovery", "eligibility", "drafter", "summarizing"];
const VISIBLE_PHASES: Array<Exclude<Phase, "starting" | "summarizing">> = [
  "discovery",
  "eligibility",
  "drafter",
];
const PHASE_LABELS: Record<Phase, string> = {
  starting: "Starting",
  discovery: "Searching grants.gov",
  eligibility: "Checking eligibility",
  drafter: "Drafting application skeleton",
  summarizing: "Summarizing",
};

export function RunProgress({ run, elapsed }: { run: RunState; elapsed: number }) {
  if (run.status === "idle") return null;

  const isRunning = run.status === "running";
  const isDone = run.status === "done";
  const isError = run.status === "error";

  const currentPhase: Phase | null = isRunning ? run.phase : null;
  const currentPhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1;

  const headlineLabel = isError
    ? `Run failed${run.message ? ` — ${run.message}` : ""}`
    : isDone
      ? "Done"
      : currentPhase && currentPhase !== "starting"
        ? `${PHASE_LABELS[currentPhase]}…`
        : "Starting…";

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "p-4 border",
        isError
          ? "border-red-400/40"
          : isDone
            ? "border-[var(--color-primary)]/40"
            : "border-[var(--color-border)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {isRunning && (
          <Loader2 aria-hidden className="size-3.5 text-[var(--color-primary)] animate-spin" />
        )}
        {isDone && (
          <span aria-hidden className="inline-block size-3 rounded-full bg-[var(--color-primary)]" />
        )}
        {isError && (
          <span aria-hidden className="inline-block size-3 rounded-full bg-red-400" />
        )}
        <span className="text-[var(--color-foreground)]">{headlineLabel}</span>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-muted-foreground)]">
          {isRunning && (
            <>
              {elapsed}s ·{" "}
              {run.mode === "custom"
                ? "custom runs typically take 60–120s"
                : "live ~60–120s · replay ~1s"}
            </>
          )}
          {isDone && (
            <>
              {(run.durationMs / 1000).toFixed(1)}s
              {run.cost !== undefined && <> · ${run.cost.toFixed(4)}</>}
            </>
          )}
        </span>
      </div>

      <ol className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        {VISIBLE_PHASES.map((p, i) => {
          const phaseIndex = PHASE_ORDER.indexOf(p);
          let state: "pending" | "active" | "done" | "skipped" | "errored";
          if (isError) {
            state =
              currentPhaseIndex > phaseIndex
                ? "done"
                : currentPhaseIndex === phaseIndex
                  ? "errored"
                  : "skipped";
          } else if (isDone) {
            state = "done";
          } else if (currentPhaseIndex > phaseIndex) {
            state = "done";
          } else if (currentPhaseIndex === phaseIndex) {
            state = "active";
          } else {
            state = "pending";
          }

          const colorClasses = {
            pending: "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
            active: "border-[var(--color-primary)] text-[var(--color-primary)]",
            done: "border-[var(--color-primary)]/40 text-[var(--color-foreground)]",
            skipped: "border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-50",
            errored: "border-red-400/40 text-red-300",
          }[state];

          return (
            <li
              key={p}
              className={cn("p-2 border flex items-start gap-2", colorClasses)}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span aria-hidden className="font-mono mt-0.5 inline-flex size-3.5 items-center justify-center">
                {state === "active" && <Loader2 className="size-3 animate-spin" />}
                {state === "done" && <Check className="size-3" />}
                {state === "skipped" && <Minus className="size-3" />}
                {state === "errored" && <X className="size-3" />}
                {state === "pending" && <span className="text-[10px]">{i + 1}</span>}
              </span>
              <span className="leading-4">
                <span className="block">{PHASE_LABELS[p]}</span>
                {state === "active" && (
                  <span className="block mt-1 text-[10px] opacity-70">in progress…</span>
                )}
                {state === "done" && (
                  <span className="block mt-1 text-[10px] opacity-70">complete</span>
                )}
                {state === "errored" && (
                  <span className="block mt-1 text-[10px] opacity-70">failed</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
