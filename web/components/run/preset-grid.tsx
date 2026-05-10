"use client";

import * as React from "react";
import { Play } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PresetIntent } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PresetGrid({
  presets,
  onRun,
  disabled,
  selectedId,
}: {
  presets: PresetIntent[];
  onRun: (id: string) => void;
  disabled: boolean;
  selectedId: string | null;
}) {
  return (
    <ul className="grid gap-3" aria-busy={disabled}>
      {presets.map((p) => {
        const active = selectedId === p.id;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onRun(p.id)}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                "group relative w-full text-left transition-all",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:-translate-y-px",
              )}
            >
              <Card
                className={cn(
                  "p-4 transition-colors",
                  active
                    ? "border-[var(--color-primary)]"
                    : "border-[var(--color-border)] group-hover:border-white/30",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 inline-flex size-7 items-center justify-center border transition-colors",
                      active
                        ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-foreground)] group-hover:border-white/30",
                    )}
                  >
                    <Play className="size-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{p.intent}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="muted">{p.profile.state}</Badge>
                      <Badge variant="muted">{p.profile.entityType}</Badge>
                      <Badge variant="muted">
                        {p.profile.employeeCount} employee
                        {p.profile.employeeCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
