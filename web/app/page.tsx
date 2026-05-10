"use client";

import { useEffect, useRef, useState } from "react";

const CUSTOM_INTENT_MIN_CHARS = 20;
const CUSTOM_INTENT_MAX_CHARS = 600;
const CUSTOM_MISSION_MAX_CHARS = 400;

type Intent = {
  id: string;
  intent: string;
  profile: { state: string; entityType: string; employeeCount: number };
};

type StepEvent =
  | { kind: "meta"; mode: "live" | "replay"; intent: Intent; isCustom?: boolean }
  | { kind: "phase"; phase: "discovery" | "eligibility" | "drafter" }
  | { kind: "step"; step: { kind: string; [k: string]: unknown } }
  | { kind: "summary"; summary: { totalCostUSD: number; totalLatencyMs: number; draftFor: string | null } }
  | { kind: "error"; message: string };

type BudgetStatus = {
  spentUSD: number;
  capUSD: number;
  remainingUSD: number;
  overCap: boolean;
  configured: boolean;
};

const INTENTS: Intent[] = [
  {
    id: "az-construction",
    intent:
      "I run a 12-person construction firm in Arizona. What infrastructure-related federal grants might fit?",
    profile: { state: "AZ", entityType: "for-profit", employeeCount: 12 },
  },
  {
    id: "vt-nonprofit-workforce",
    intent:
      "I'm a 3-person nonprofit in rural Vermont focused on workforce training. Where should I look?",
    profile: { state: "VT", entityType: "nonprofit", employeeCount: 3 },
  },
  {
    id: "tx-cyber-woman-owned",
    intent:
      "My woman-owned cybersecurity consultancy in Texas has 8 employees and $1.2M revenue. Any SBA innovation grants?",
    profile: { state: "TX", entityType: "for-profit", employeeCount: 8 },
  },
  {
    id: "oh-veteran-mfg",
    intent:
      "I'm a veteran-owned manufacturing startup in Ohio, 18 months old, 5 employees. What's available?",
    profile: { state: "OH", entityType: "for-profit", employeeCount: 5 },
  },
  {
    id: "ia-ag-coop",
    intent:
      "I run a 25-person agricultural co-op in Iowa. Are there USDA grants for equipment modernization?",
    profile: { state: "IA", entityType: "co-op", employeeCount: 25 },
  },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
  "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

type CustomProfile = {
  naicsCode: string;
  employeeCount: number;
  annualRevenueUSD: number;
  state: string;
  zip: string;
  ownership: {
    womanOwned: boolean;
    veteranOwned: boolean;
    minorityOwned: boolean;
    disadvantaged: boolean;
  };
  entityType: "for-profit" | "nonprofit" | "sole-prop" | "co-op" | "tribal";
  yearsInOperation: number;
  missionDescription?: string;
};

const DEFAULT_CUSTOM_PROFILE: CustomProfile = {
  naicsCode: "541512",
  employeeCount: 8,
  annualRevenueUSD: 750_000,
  state: "CA",
  zip: "94110",
  ownership: {
    womanOwned: false,
    veteranOwned: false,
    minorityOwned: false,
    disadvantaged: false,
  },
  entityType: "for-profit",
  yearsInOperation: 3,
  missionDescription: "",
};

type Phase = "discovery" | "eligibility" | "drafter" | null;

export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [phase, setPhase] = useState<Phase>(null);
  const [elapsed, setElapsed] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);

  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customProfile, setCustomProfile] = useState<CustomProfile>(DEFAULT_CUSTOM_PROFILE);
  const [customError, setCustomError] = useState<string | null>(null);

  const [budget, setBudget] = useState<BudgetStatus | null>(null);

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [events]);

  // Tick elapsed seconds while running.
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [running]);

  // Refresh budget status on mount and after every run.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/budget", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as BudgetStatus;
        if (!cancelled) setBudget(data);
      } catch {
        // budget is informational only
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [running]);

  async function streamRun(body: Record<string, unknown>) {
    setRunning(true);
    setEvents([]);
    setPhase(null);
    setBanner(null);
    setCustomError(null);

    try {
      const resp = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const ct = resp.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const json = (await resp.json()) as {
          mode?: string;
          reason?: string;
          run?: { steps?: { kind: string; [k: string]: unknown }[]; summary?: StepEvent extends { kind: "summary"; summary: infer S } ? S : unknown };
          error?: string;
          remaining?: number;
        };
        if (json.error === "rate-limited") {
          setBanner(`Rate limit hit (${json.remaining ?? 0} runs left this hour). Please come back later.`);
        } else if (json.error === "rejected") {
          setCustomError(json.reason ?? "Input rejected.");
        } else if (json.error === "over-cap") {
          setBanner(json.reason ?? "Daily budget cap reached.");
        } else if (json.error === "no-key") {
          setBanner(json.reason ?? "Live mode unavailable.");
        } else if (json.error) {
          setBanner(`Error: ${json.error}${json.reason ? ` — ${json.reason}` : ""}`);
        } else if (json.mode === "replay") {
          setBanner(json.reason ?? "Replaying recorded run.");
          if (json.run?.steps) {
            for (const step of json.run.steps) {
              setEvents((prev) => [...prev, { kind: "step", step: step as { kind: string; [k: string]: unknown } }]);
            }
            if (json.run.summary) {
              setEvents((prev) => [
                ...prev,
                { kind: "summary", summary: json.run!.summary as StepEvent extends { kind: "summary"; summary: infer S } ? S : never },
              ]);
            }
          }
        }
        setRunning(false);
        return;
      }

      if (!resp.body) {
        setBanner("No response body.");
        setRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
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
              setPhase(ev.phase);
            }
            setEvents((prev) => [...prev, ev]);
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (err) {
      setBanner(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  function runPreset(id: string) {
    setSelectedId(id);
    setCustomMode(false);
    void streamRun({ intentId: id });
  }

  function runCustom() {
    if (customText.trim().length < CUSTOM_INTENT_MIN_CHARS) {
      setCustomError(`At least ${CUSTOM_INTENT_MIN_CHARS} characters please.`);
      return;
    }
    if (!/^\d{2,6}$/.test(customProfile.naicsCode)) {
      setCustomError("NAICS code must be 2–6 digits.");
      return;
    }
    if (!/^\d{5}$/.test(customProfile.zip)) {
      setCustomError("ZIP must be 5 digits.");
      return;
    }
    setSelectedId(null);
    const profileToSend: CustomProfile = {
      ...customProfile,
      missionDescription: customProfile.missionDescription?.trim() || undefined,
    };
    void streamRun({
      customIntent: customText.trim(),
      customProfile: profileToSend,
    });
  }

  const customRemaining = CUSTOM_INTENT_MAX_CHARS - customText.length;
  const missionRemaining =
    CUSTOM_MISSION_MAX_CHARS - (customProfile.missionDescription?.length ?? 0);

  return (
    <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">grant-pilot</h1>
        <p className="text-sm leading-6 text-[rgb(var(--muted))]">
          An agent that finds federal grants for a small business or nonprofit and drafts an
          application skeleton. Pick a preset intent or write your own to watch the planner
          dispatch three sub-agents — discovery, eligibility, drafter — over live grants.gov +
          SAM.gov data.
        </p>
        <p className="text-xs mt-3 text-[rgb(var(--muted))]">
          Source:{" "}
          <a className="underline" href="https://github.com/midimurphdesigns/grant-pilot">
            github.com/midimurphdesigns/grant-pilot
          </a>
        </p>
        {budget && budget.configured && <BudgetPill budget={budget} />}
      </header>

      <div className="flex gap-2 mb-4 text-xs">
        <button
          onClick={() => setCustomMode(false)}
          className={`px-3 py-1 border ${
            !customMode
              ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))]"
              : "border-white/10 text-[rgb(var(--muted))] hover:border-white/30"
          }`}
        >
          Preset intents
        </button>
        <button
          onClick={() => setCustomMode(true)}
          className={`px-3 py-1 border ${
            customMode
              ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))]"
              : "border-white/10 text-[rgb(var(--muted))] hover:border-white/30"
          }`}
        >
          Custom intent
        </button>
      </div>

      {!customMode && (
        <section className="grid gap-3 mb-8">
          {INTENTS.map((i) => (
            <button
              key={i.id}
              onClick={() => runPreset(i.id)}
              disabled={running}
              className={`text-left p-4 border transition ${
                selectedId === i.id
                  ? "border-[rgb(var(--accent))]"
                  : "border-white/10 hover:border-white/30"
              } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="text-sm">{i.intent}</div>
              <div className="text-xs mt-1 text-[rgb(var(--muted))]">
                {i.profile.state} · {i.profile.entityType} · {i.profile.employeeCount} employees
              </div>
            </button>
          ))}
        </section>
      )}

      {customMode && (
        <section className="mb-8 space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
              Describe your funding need (1–2 sentences)
            </label>
            <textarea
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setCustomError(null);
              }}
              maxLength={CUSTOM_INTENT_MAX_CHARS}
              rows={3}
              placeholder="e.g. I run a 6-person community theater in Maine looking for arts-and-culture grants under $50K."
              className="w-full p-3 bg-transparent border border-white/10 focus:border-[rgb(var(--accent))] focus:outline-none text-sm leading-5"
              disabled={running}
            />
            <div className="flex justify-between mt-1 text-[10px] text-[rgb(var(--muted))]">
              <span>
                {customText.length < CUSTOM_INTENT_MIN_CHARS
                  ? `${CUSTOM_INTENT_MIN_CHARS - customText.length} more characters needed`
                  : "Looks good"}
              </span>
              <span>{customRemaining} chars left</span>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-[rgb(var(--muted))] mb-3">
              Your organization
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Entity type">
                <select
                  value={customProfile.entityType}
                  onChange={(e) =>
                    setCustomProfile((p) => ({
                      ...p,
                      entityType: e.target.value as CustomProfile["entityType"],
                    }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                >
                  <option value="for-profit">For-profit</option>
                  <option value="nonprofit">Nonprofit</option>
                  <option value="sole-prop">Sole proprietorship</option>
                  <option value="co-op">Cooperative</option>
                  <option value="tribal">Tribal entity</option>
                </select>
              </Field>

              <Field label="State">
                <select
                  value={customProfile.state}
                  onChange={(e) =>
                    setCustomProfile((p) => ({ ...p, state: e.target.value }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="ZIP" hint="5 digits">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{5}"
                  value={customProfile.zip}
                  onChange={(e) =>
                    setCustomProfile((p) => ({ ...p, zip: e.target.value.replace(/\D/g, "").slice(0, 5) }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                />
              </Field>

              <Field label="NAICS" hint="2–6 digits">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{2,6}"
                  value={customProfile.naicsCode}
                  onChange={(e) =>
                    setCustomProfile((p) => ({ ...p, naicsCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                />
              </Field>

              <Field label="Employees">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={customProfile.employeeCount}
                  onChange={(e) =>
                    setCustomProfile((p) => ({
                      ...p,
                      employeeCount: Math.max(1, Math.min(10000, Number(e.target.value) || 1)),
                    }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                />
              </Field>

              <Field label="Annual revenue (USD)">
                <input
                  type="number"
                  min={0}
                  max={1_000_000_000}
                  step={1000}
                  value={customProfile.annualRevenueUSD}
                  onChange={(e) =>
                    setCustomProfile((p) => ({
                      ...p,
                      annualRevenueUSD: Math.max(0, Math.min(1_000_000_000, Number(e.target.value) || 0)),
                    }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                />
              </Field>

              <Field label="Years in operation">
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={0.5}
                  value={customProfile.yearsInOperation}
                  onChange={(e) =>
                    setCustomProfile((p) => ({
                      ...p,
                      yearsInOperation: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                    }))
                  }
                  disabled={running}
                  className="w-full bg-transparent border border-white/10 px-2 py-1 focus:border-[rgb(var(--accent))] focus:outline-none"
                />
              </Field>

              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
                  Ownership designations
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["womanOwned", "Woman-owned"],
                      ["veteranOwned", "Veteran-owned"],
                      ["minorityOwned", "Minority-owned"],
                      ["disadvantaged", "Disadvantaged"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customProfile.ownership[key]}
                        onChange={(e) =>
                          setCustomProfile((p) => ({
                            ...p,
                            ownership: { ...p.ownership, [key]: e.target.checked },
                          }))
                        }
                        disabled={running}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
              Mission description (optional)
            </label>
            <textarea
              value={customProfile.missionDescription ?? ""}
              onChange={(e) =>
                setCustomProfile((p) => ({
                  ...p,
                  missionDescription: e.target.value.slice(0, CUSTOM_MISSION_MAX_CHARS),
                }))
              }
              maxLength={CUSTOM_MISSION_MAX_CHARS}
              rows={2}
              placeholder="e.g. 501(c)(3) community theater producing 4 mainstage shows per season in rural Maine."
              className="w-full p-3 bg-transparent border border-white/10 focus:border-[rgb(var(--accent))] focus:outline-none text-sm leading-5"
              disabled={running}
            />
            <div className="text-right mt-1 text-[10px] text-[rgb(var(--muted))]">
              {missionRemaining} chars left
            </div>
          </div>

          {customError && (
            <div className="p-3 border border-red-400/40 text-xs text-red-300">{customError}</div>
          )}

          <button
            onClick={runCustom}
            disabled={running || customText.trim().length < CUSTOM_INTENT_MIN_CHARS}
            className={`px-4 py-2 border text-xs uppercase tracking-wider ${
              running || customText.trim().length < CUSTOM_INTENT_MIN_CHARS
                ? "border-white/10 text-[rgb(var(--muted))] cursor-not-allowed"
                : "border-[rgb(var(--accent))] text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))]/10"
            }`}
          >
            Run custom intent
          </button>

          <details className="text-[11px] text-[rgb(var(--muted))]">
            <summary className="cursor-pointer hover:text-[rgb(var(--ink))]">
              How is this safe to expose publicly?
            </summary>
            <div className="mt-2 leading-5 max-w-prose space-y-2">
              <p>
                Every structured field is bounded — enums, integer ranges, regex-validated digit
                strings. There&apos;s no injection surface in <code>employeeCount</code>,{" "}
                <code>state</code>, <code>naicsCode</code>, or the booleans.
              </p>
              <p>
                The two free-text fields (intent and mission description) are length-capped (600 /
                400 chars) and run through a heuristic filter that rejects common jailbreak
                phrases before any model call.
              </p>
              <p>
                Per-IP rate limit (5/hr) and a daily budget cap protect against runaway cost. When
                the cap is hit, custom mode returns 503; preset intents fall back to recordings.
              </p>
            </div>
          </details>
        </section>
      )}

      {banner && (
        <div className="mb-4 p-3 border border-[rgb(var(--accent))]/40 text-xs text-[rgb(var(--ink))]">
          {banner}
        </div>
      )}

      <RunStatus running={running} phase={phase} elapsed={elapsed} events={events} />

      <div
        ref={transcriptRef}
        className="border border-white/10 p-4 min-h-[200px] max-h-[60vh] overflow-y-auto text-xs leading-5 whitespace-pre-wrap"
      >
        {events.length === 0 && !running && (
          <span className="text-[rgb(var(--muted))]">
            {customMode ? "Fill in the form and run." : "Pick a preset intent above."} Transcript
            appears here.
          </span>
        )}
        {events.map((ev, i) => (
          <pre key={i} className="mb-3">
            {JSON.stringify(ev, null, 2)}
          </pre>
        ))}
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] mb-1">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function RunStatus({
  running,
  phase,
  elapsed,
  events,
}: {
  running: boolean;
  phase: Phase;
  elapsed: number;
  events: StepEvent[];
}) {
  if (!running && events.length === 0) return null;

  const stepCount = events.filter((e) => e.kind === "step").length;
  const phaseLabel = phase
    ? {
        discovery: "Searching grants.gov…",
        eligibility: "Checking eligibility…",
        drafter: "Drafting application skeleton…",
      }[phase]
    : running
      ? "Starting…"
      : "Done";

  const cost = events.find((e) => e.kind === "summary")?.summary?.totalCostUSD;

  return (
    <div className="mb-4 p-3 border border-white/10 flex items-center gap-3 text-xs">
      {running && (
        <span
          aria-hidden
          className="inline-block w-3 h-3 rounded-full bg-[rgb(var(--accent))] animate-pulse"
        />
      )}
      {!running && (
        <span aria-hidden className="inline-block w-3 h-3 rounded-full bg-[rgb(var(--accent))]" />
      )}
      <span className="text-[rgb(var(--ink))]">{phaseLabel}</span>
      <span className="ml-auto font-mono text-[10px] text-[rgb(var(--muted))]">
        {running && (
          <>
            {elapsed}s · {stepCount} step{stepCount === 1 ? "" : "s"} · custom runs typically
            take 60–120s
          </>
        )}
        {!running && cost !== undefined && <>${cost.toFixed(4)} · {stepCount} steps</>}
      </span>
    </div>
  );
}

function BudgetPill({ budget }: { budget: BudgetStatus }) {
  const pct = budget.capUSD > 0 ? Math.min(100, (budget.spentUSD / budget.capUSD) * 100) : 0;
  const state =
    budget.overCap || pct >= 100
      ? "exhausted"
      : pct >= 80
        ? "warning"
        : pct >= 50
          ? "moderate"
          : "ok";

  const stateLabel = {
    ok: "live runs available",
    moderate: "live runs available",
    warning: "approaching daily cap",
    exhausted: "daily cap reached — preset intents fall back to recordings",
  }[state];

  const barColor = {
    ok: "bg-[rgb(var(--accent))]",
    moderate: "bg-[rgb(var(--accent))]",
    warning: "bg-yellow-400",
    exhausted: "bg-red-400",
  }[state];

  return (
    <div className="mt-5 border border-white/10 p-3" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
        <span>Daily budget — {stateLabel}</span>
        <span className="font-mono text-[rgb(var(--ink))]">
          ${budget.spentUSD.toFixed(2)} / ${budget.capUSD.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 h-1 bg-white/5 overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[10px] text-[rgb(var(--muted))] leading-4">
        Counter resets at 00:00 UTC. Each run costs roughly $0.05–0.10. Per-IP rate limit: 5
        runs/hour. Over-cap behavior: preset intents serve their recorded run; custom intents
        return a 503 with this banner.
      </p>
    </div>
  );
}
