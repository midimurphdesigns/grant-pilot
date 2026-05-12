"use client";

import * as React from "react";
import { ExternalLink, Github } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetPill } from "@/components/run/budget-pill";
import { RunProgress } from "@/components/run/run-progress";
import { EmptyState } from "@/components/run/empty-state";
import { PresetGrid } from "@/components/run/preset-grid";
import { CustomForm } from "@/components/run/custom-form";
import { Transcript } from "@/components/transcript/transcript";
import {
  CUSTOM_INTENT_MIN_CHARS,
  DEFAULT_CUSTOM_PROFILE,
  PRESETS,
  type BudgetStatus,
  type CustomProfile,
  type Phase,
  type RunMode,
  type RunState,
  type StepEvent,
} from "@/lib/types";

type CustomErrors = Partial<Record<"intent" | "naicsCode" | "zip", string>>;

export default function Page() {
  const [tab, setTab] = React.useState<RunMode>("preset");
  const [run, setRun] = React.useState<RunState>({ status: "idle" });
  const [events, setEvents] = React.useState<StepEvent[]>([]);
  const [partialDraft, setPartialDraft] = React.useState<{
    opportunityNumber: string;
    partial: import("@/lib/types").PartialDraft;
  } | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  const [customText, setCustomText] = React.useState("");
  const [customProfile, setCustomProfile] = React.useState<CustomProfile>(DEFAULT_CUSTOM_PROFILE);
  const [customErrors, setCustomErrors] = React.useState<CustomErrors>({});

  const [budget, setBudget] = React.useState<BudgetStatus | null>(null);
  const [budgetLoading, setBudgetLoading] = React.useState(true);

  const abortRef = React.useRef<AbortController | null>(null);
  const isRunning = run.status === "running";
  const hasOutput = events.length > 0;
  const hasRunCustom =
    (run.status === "done" || run.status === "error") && run.mode === "custom";

  React.useEffect(() => {
    if (!isRunning) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [isRunning]);

  React.useEffect(() => {
    let cancelled = false;
    setBudgetLoading(true);
    async function load() {
      try {
        const r = await fetch("/api/budget", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as BudgetStatus;
        if (!cancelled) setBudget(data);
      } catch {
        // budget is informational only
      } finally {
        if (!cancelled) setBudgetLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [run.status]);

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function streamRun(body: Record<string, unknown>, mode: RunMode, presetId: string | null) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setEvents([]);
    setPartialDraft(null);
    setRun({
      status: "running",
      mode,
      presetId,
      phase: "starting",
      startedAt: Date.now(),
    });

    try {
      const resp = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      const ct = resp.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const json = (await resp.json()) as {
          mode?: string;
          reason?: string;
          run?: { steps?: unknown[]; summary?: unknown };
          error?: string;
          remaining?: number;
          resetMs?: number;
        };

        if (json.error === "rate-limited") {
          const minutes = json.resetMs ? Math.ceil((json.resetMs - Date.now()) / 60000) : null;
          toast.error("Rate limit hit", {
            description: `${json.remaining ?? 0} runs left this hour${
              minutes != null && minutes > 0 ? ` · resets in ~${minutes} min` : ""
            }.`,
          });
          setRun({ status: "error", mode, presetId, message: "rate-limited" });
        } else if (json.error === "rejected") {
          setCustomErrors((prev) => ({ ...prev, intent: json.reason ?? "Input rejected." }));
          toast.error("Input rejected", { description: json.reason ?? "" });
          setRun({ status: "error", mode, presetId, message: "rejected" });
        } else if (json.error === "over-cap") {
          toast.warning("Daily budget cap reached", { description: json.reason ?? "" });
          setRun({ status: "error", mode, presetId, message: "over-cap" });
        } else if (json.error === "no-key") {
          toast.error("Live mode unavailable", { description: json.reason ?? "" });
          setRun({ status: "error", mode, presetId, message: "no-key" });
        } else if (json.error) {
          toast.error("Error", {
            description: `${json.error}${json.reason ? ` — ${json.reason}` : ""}`,
          });
          setRun({ status: "error", mode, presetId, message: json.error });
        } else if (json.mode === "replay") {
          toast.info("Replaying recorded run", { description: json.reason ?? undefined });
          if (json.run?.steps) {
            for (const step of json.run.steps) {
              setEvents((prev) => [
                ...prev,
                { kind: "step", step: step as Extract<StepEvent, { kind: "step" }>["step"] },
              ]);
            }
          }
          if (json.run?.summary) {
            const summary = json.run.summary as Extract<StepEvent, { kind: "summary" }>["summary"];
            setEvents((prev) => [...prev, { kind: "summary", summary }]);
            setRun({
              status: "done",
              mode,
              presetId,
              durationMs: summary.totalLatencyMs,
              cost: summary.totalCostUSD,
            });
          } else {
            setRun({ status: "done", mode, presetId, durationMs: 0 });
          }
        }
        return;
      }

      if (!resp.body) {
        toast.error("No response body");
        setRun({ status: "error", mode, presetId, message: "no body" });
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let lastSummary: Extract<StepEvent, { kind: "summary" }>["summary"] | null = null;
      let sawError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as StepEvent;
            if (ev.kind === "phase") {
              setRun((r) => (r.status === "running" ? { ...r, phase: ev.phase as Phase } : r));
            }
            if (ev.kind === "summary") {
              lastSummary = ev.summary;
              setRun((r) => (r.status === "running" ? { ...r, phase: "summarizing" } : r));
            }
            if (ev.kind === "error") sawError = ev.message;
            // Drafter streams: track the in-flight partial draft for
            // progressive rendering. Once the final drafter step lands
            // in the events array (kind === "step", step.kind === "drafter"),
            // the partial preview clears.
            if (ev.kind === "draft-partial") {
              setPartialDraft({ opportunityNumber: ev.opportunityNumber, partial: ev.partial });
            } else if (ev.kind === "step" && ev.step.kind === "drafter") {
              setPartialDraft(null);
            }
            // Don't append draft-partial events to the transcript history —
            // they're transient streaming state, not final transcript steps.
            if (ev.kind !== "draft-partial") {
              setEvents((prev) => [...prev, ev]);
            }
          } catch {
            // skip malformed line
          }
        }
      }

      if (sawError) {
        toast.error("Stream error", { description: sawError });
        setRun({ status: "error", mode, presetId, message: sawError });
      } else if (lastSummary) {
        setRun({
          status: "done",
          mode,
          presetId,
          durationMs: lastSummary.totalLatencyMs,
          cost: lastSummary.totalCostUSD,
        });
      } else {
        setRun({ status: "done", mode, presetId, durationMs: 0 });
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Network error", { description: msg });
      setRun({ status: "error", mode, presetId, message: msg });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }

  function runPreset(id: string) {
    if (isRunning) return;
    void streamRun({ intentId: id }, "preset", id);
  }

  function runCustom() {
    if (isRunning) return;
    const errors: CustomErrors = {};
    if (customText.trim().length < CUSTOM_INTENT_MIN_CHARS) {
      errors.intent = `At least ${CUSTOM_INTENT_MIN_CHARS} characters please.`;
    }
    if (!/^\d{2,6}$/.test(customProfile.naicsCode)) {
      errors.naicsCode = "NAICS code must be 2–6 digits.";
    }
    if (!/^\d{5}$/.test(customProfile.zip)) {
      errors.zip = "ZIP must be 5 digits.";
    }
    setCustomErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const profileToSend: CustomProfile = {
      ...customProfile,
      missionDescription: customProfile.missionDescription?.trim() || undefined,
    };
    void streamRun(
      { customIntent: customText.trim(), customProfile: profileToSend },
      "custom",
      null,
    );
  }

  function clearOutput() {
    if (isRunning) return;
    setEvents([]);
    setPartialDraft(null);
    setCustomErrors({});
    setRun({ status: "idle" });
  }

  function switchTab(next: RunMode) {
    if (isRunning || tab === next) return;
    setTab(next);
    setEvents([]);
    setPartialDraft(null);
    setCustomErrors({});
    setRun({ status: "idle" });
  }

  const selectedPresetId = run.status !== "idle" && run.mode === "preset" ? run.presetId : null;

  return (
    <TooltipProvider delayDuration={200}>
      <main className="min-h-screen px-4 py-12 sm:px-6 max-w-5xl mx-auto">
        <header className="mb-10 grid grid-cols-1 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-8">
            <h1 className="type-display text-5xl mb-3">grant-pilot</h1>
            <p className="text-sm leading-6 text-[var(--color-muted-foreground)] max-w-2xl">
              An agent that finds federal grants for a small business or nonprofit and drafts an
              application skeleton. Pick a preset intent or write your own to watch the planner
              dispatch three sub-agents — discovery, eligibility, drafter — over live grants.gov +
              SAM.gov data.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
              <a
                href="https://github.com/midimurphdesigns/grant-pilot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-[var(--color-foreground)] hover:underline"
              >
                <Github className="size-3.5" />
                github.com/midimurphdesigns/grant-pilot
              </a>
              <a
                href="https://kevinmurphywebdev.com/blog/building-grant-pilot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-[var(--color-foreground)] hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Read the blog post
              </a>
            </div>
          </div>
          <aside className="lg:col-span-4 mt-6 lg:mt-0 lg:sticky lg:top-6 self-start">
            <BudgetPill budget={budget} loading={budgetLoading} />
          </aside>
        </header>

        <Tabs value={tab} onValueChange={(v) => switchTab(v as RunMode)} className="mb-6">
          <TabsList>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="preset" disabled={isRunning && tab !== "preset"}>
                  Preset intents
                </TabsTrigger>
              </TooltipTrigger>
              {isRunning && tab !== "preset" && (
                <TooltipContent>Wait for the current run to finish</TooltipContent>
              )}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="custom" disabled={isRunning && tab !== "custom"}>
                  Custom intent
                </TabsTrigger>
              </TooltipTrigger>
              {isRunning && tab !== "custom" && (
                <TooltipContent>Wait for the current run to finish</TooltipContent>
              )}
            </Tooltip>
          </TabsList>

          <TabsContent value="preset" className="mt-6">
            <PresetGrid
              presets={PRESETS}
              onRun={runPreset}
              disabled={isRunning}
              selectedId={selectedPresetId}
            />
          </TabsContent>

          <TabsContent value="custom" className="mt-6">
            <CustomForm
              intent={customText}
              profile={customProfile}
              onIntentChange={(s) => {
                setCustomText(s);
                setCustomErrors((prev) => ({ ...prev, intent: undefined }));
              }}
              onProfileChange={(p) => {
                setCustomProfile(p);
                setCustomErrors((prev) => ({ ...prev, naicsCode: undefined, zip: undefined }));
              }}
              onRun={runCustom}
              disabled={isRunning}
              errors={customErrors}
              hasRun={hasRunCustom}
              onClear={clearOutput}
            />
          </TabsContent>
        </Tabs>

        {(run.status === "running" || run.status === "done" || run.status === "error") && (
          <div className="mb-4">
            <RunProgress run={run} elapsed={elapsed} />
          </div>
        )}

        {hasOutput ? (
          <Transcript events={events} partialDraft={partialDraft} />
        ) : (
          run.status === "idle" && (
            <EmptyState
              message={
                tab === "custom"
                  ? "Fill in the form above and click Run. The transcript will stream here as the planner dispatches each sub-agent."
                  : "Pick a preset intent above. The transcript will stream here as the planner runs."
              }
            />
          )
        )}

        <Toaster position="top-right" />
      </main>
    </TooltipProvider>
  );
}
