"use client";

import { useEffect, useRef, useState } from "react";

type Intent = {
  id: string;
  intent: string;
  profile: { state: string; entityType: string; employeeCount: number };
};

type StepEvent =
  | { kind: "meta"; mode: "live" | "replay"; intent: Intent }
  | { kind: "step"; step: unknown }
  | { kind: "summary"; summary: unknown }
  | { kind: "error"; message: string };

const INTENTS: Intent[] = [
  {
    id: "az-construction",
    intent: "I run a 12-person construction firm in Arizona. What infrastructure-related federal grants might fit?",
    profile: { state: "AZ", entityType: "for-profit", employeeCount: 12 },
  },
  {
    id: "vt-nonprofit-workforce",
    intent: "I'm a 3-person nonprofit in rural Vermont focused on workforce training. Where should I look?",
    profile: { state: "VT", entityType: "nonprofit", employeeCount: 3 },
  },
  {
    id: "tx-cyber-woman-owned",
    intent: "My woman-owned cybersecurity consultancy in Texas has 8 employees and $1.2M revenue. Any SBA innovation grants?",
    profile: { state: "TX", entityType: "for-profit", employeeCount: 8 },
  },
  {
    id: "oh-veteran-mfg",
    intent: "I'm a veteran-owned manufacturing startup in Ohio, 18 months old, 5 employees. What's available?",
    profile: { state: "OH", entityType: "for-profit", employeeCount: 5 },
  },
  {
    id: "ia-ag-coop",
    intent: "I run a 25-person agricultural co-op in Iowa. Are there USDA grants for equipment modernization?",
    profile: { state: "IA", entityType: "co-op", employeeCount: 25 },
  },
];

export default function Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  async function run(id: string) {
    setSelectedId(id);
    setRunning(true);
    setEvents([]);
    setBanner(null);

    try {
      const resp = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: id }),
      });

      const ct = resp.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = (await resp.json()) as { mode?: string; reason?: string; run?: unknown; error?: string };
        if (body.error) {
          setBanner(`Error: ${body.error}`);
        } else if (body.mode === "replay") {
          setBanner(body.reason ?? "Replaying recorded run.");
          // Synthesize step events from the recorded run so the same
          // renderer handles both modes.
          const run = body.run as { steps?: unknown[]; summary?: unknown } | null;
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

      // NDJSON streaming.
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

  return (
    <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">grant-pilot</h1>
        <p className="text-sm leading-6 text-[rgb(var(--muted))]">
          An agent that finds federal grants for a small business or nonprofit and drafts an application skeleton.
          Pick a demo intent to watch the planner dispatch three sub-agents — discovery, eligibility, drafter — over
          live grants.gov + SAM.gov data.
        </p>
        <p className="text-xs mt-3 text-[rgb(var(--muted))]">
          Source:{" "}
          <a className="underline" href="https://github.com/midimurphdesigns/grant-pilot">
            github.com/midimurphdesigns/grant-pilot
          </a>
        </p>
      </header>

      <section className="grid gap-3 mb-8">
        {INTENTS.map((i) => (
          <button
            key={i.id}
            onClick={() => run(i.id)}
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
          <span className="text-[rgb(var(--muted))]">Pick an intent above. Transcript appears here.</span>
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
