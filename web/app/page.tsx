"use client";

import { useEffect, useRef, useState } from "react";

const CUSTOM_INTENT_MIN_CHARS = 20;
const CUSTOM_INTENT_MAX_CHARS = 600;

type Intent = {
  id: string;
  intent: string;
  profile: { state: string; entityType: string; employeeCount: number };
};

type StepEvent =
  | { kind: "meta"; mode: "live" | "replay"; intent: Intent; isCustom?: boolean }
  | { kind: "step"; step: unknown }
  | { kind: "summary"; summary: unknown }
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

export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  // Custom-intent state
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customProfileId, setCustomProfileId] = useState<string>(INTENTS[0]!.id);
  const [customError, setCustomError] = useState<string | null>(null);

  const [budget, setBudget] = useState<BudgetStatus | null>(null);

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [events]);

  // Refresh budget status on mount and after every run completes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/budget", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as BudgetStatus;
        if (!cancelled) setBudget(data);
      } catch {
        // ignore — budget is informational only
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [running]);

  async function streamRun(body: Record<string, unknown>, label: string) {
    setRunning(true);
    setEvents([]);
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
          run?: unknown;
          error?: string;
          remaining?: number;
        };
        if (json.error === "rate-limited") {
          setBanner(
            `Rate limit hit (${json.remaining ?? 0} runs left this hour). Please come back later.`,
          );
        } else if (json.error === "rejected") {
          setCustomError(json.reason ?? "Input rejected.");
        } else if (json.error === "over-cap") {
          setBanner(json.reason ?? "Daily budget cap reached.");
        } else if (json.error === "no-key") {
          setBanner(json.reason ?? "Live mode unavailable.");
        } else if (json.error) {
          setBanner(`Error: ${json.error}`);
        } else if (json.mode === "replay") {
          setBanner(json.reason ?? "Replaying recorded run.");
          const run = json.run as { steps?: unknown[]; summary?: unknown } | null;
          if (run?.steps) {
            for (const step of run.steps) {
              setEvents((prev) => [...prev, { kind: "step", step }]);
            }
            if (run.summary) {
              setEvents((prev) => [...prev, { kind: "summary", summary: run.summary }]);
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
    void streamRun({ intentId: id }, id);
  }

  function runCustom() {
    if (customText.trim().length < CUSTOM_INTENT_MIN_CHARS) {
      setCustomError(`At least ${CUSTOM_INTENT_MIN_CHARS} characters please.`);
      return;
    }
    setSelectedId(null);
    void streamRun(
      {
        customIntent: customText.trim(),
        profileId: customProfileId,
      },
      "custom",
    );
  }

  const customRemaining = CUSTOM_INTENT_MAX_CHARS - customText.length;

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
        <section className="mb-8 space-y-4">
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
              rows={4}
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
            <label className="block text-xs uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
              Pick a profile to attach (preset only — see why below)
            </label>
            <div className="grid gap-2">
              {INTENTS.map((i) => (
                <label
                  key={i.id}
                  className={`flex items-start gap-3 p-3 border cursor-pointer ${
                    customProfileId === i.id
                      ? "border-[rgb(var(--accent))]"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="profile"
                    value={i.id}
                    checked={customProfileId === i.id}
                    onChange={() => setCustomProfileId(i.id)}
                    disabled={running}
                    className="mt-1"
                  />
                  <span className="text-xs">
                    <span className="block">
                      {i.profile.state} · {i.profile.entityType} · {i.profile.employeeCount}{" "}
                      employees
                    </span>
                    <span className="block text-[rgb(var(--muted))] mt-1">
                      Originally: {i.intent.slice(0, 80)}…
                    </span>
                  </span>
                </label>
              ))}
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
              Why is the profile a picker, not free-text?
            </summary>
            <div className="mt-2 leading-5 max-w-prose space-y-2">
              <p>
                The structured business profile (NAICS code, headcount, ownership designations,
                etc.) is the prompt-injection surface. Letting strangers free-text it would let
                someone smuggle instructions into the planner.
              </p>
              <p>
                The intent — the natural-language description of your funding need — is bounded
                (20–600 chars), filtered for jailbreak phrases pre-LLM, and rate-limited at 5
                runs/hour/IP. The daily budget cap caps total spend.
              </p>
              <p>
                If you want to run with a fully custom profile, clone the repo and{" "}
                <code>bun run smoke</code> with your own <code>.env</code>.
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

      <div
        ref={transcriptRef}
        className="border border-white/10 p-4 min-h-[200px] max-h-[60vh] overflow-y-auto text-xs leading-5 whitespace-pre-wrap"
      >
        {events.length === 0 && !running && (
          <span className="text-[rgb(var(--muted))]">
            {customMode ? "Write a custom intent above." : "Pick an intent above."} Transcript
            appears here.
          </span>
        )}
        {running && events.length === 0 && (
          <span className="text-[rgb(var(--muted))]">Running…</span>
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
