import { Clock, DollarSign } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Summary } from "@/lib/types";

export function SummaryTile({ summary }: { summary: Summary }) {
  return (
    <section className="border-t border-[var(--color-border)] pt-8">
      <Eyebrow className="mb-3">Run summary</Eyebrow>

      <dl className="grid grid-cols-3 divide-x divide-[var(--color-border)]">
        <Metric
          icon={<Clock className="size-3" />}
          label="latency"
          value={`${(summary.totalLatencyMs / 1000).toFixed(1)}s`}
        />
        <Metric
          icon={<DollarSign className="size-3" />}
          label="cost"
          value={`$${summary.totalCostUSD.toFixed(4)}`}
        />
        <Metric
          label="drafted for"
          value={summary.draftFor ?? "—"}
          mono
        />
      </dl>

      {summary.shortlist.length > 0 && (
        <div className="mt-8">
          <Eyebrow className="mb-3">Shortlist</Eyebrow>
          <ul className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {summary.shortlist.map((s) => (
              <li
                key={s.opportunityNumber}
                className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 py-3"
              >
                <span className="font-mono text-xs text-[var(--color-muted-foreground)] tabular-nums">
                  {s.score}
                </span>
                <div className="min-w-0">
                  <p className="text-sm truncate">{decodeHtml(s.title)}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted-foreground)] tabular-nums">
                    {s.opportunityNumber}
                  </p>
                </div>
                <VerdictPill verdict={s.verdict} blockers={s.blockers.length} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-4 first:pl-0">
      <dt className="flex items-center gap-1.5 type-eyebrow">
        {icon}
        <span>{label}</span>
      </dt>
      <dd
        className={
          mono
            ? "mt-2 text-sm font-mono truncate"
            : "mt-2 text-xl tabular-nums tracking-tight"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function VerdictPill({
  verdict,
  blockers,
}: {
  verdict: "pass" | "fail" | "uncertain" | "not-checked";
  blockers: number;
}) {
  if (verdict === "not-checked") return <Badge variant="muted">not checked</Badge>;
  if (verdict === "pass") return <Badge variant="success">pass</Badge>;
  if (verdict === "fail") return <Badge variant="destructive">fail</Badge>;
  return (
    <Badge variant="warning">
      uncertain
      {blockers > 0 && ` · ${blockers} blocker${blockers === 1 ? "" : "s"}`}
    </Badge>
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
