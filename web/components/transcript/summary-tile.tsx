import { Clock, DollarSign, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Summary } from "@/lib/types";

export function SummaryTile({ summary }: { summary: Summary }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Run summary</h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-3 gap-3 border border-[var(--color-border)]">
          <Metric icon={<Clock className="size-3" />} label="latency" value={`${(summary.totalLatencyMs / 1000).toFixed(1)}s`} />
          <Metric icon={<DollarSign className="size-3" />} label="cost" value={`$${summary.totalCostUSD.toFixed(4)}`} />
          <Metric
            label="drafted for"
            value={summary.draftFor ?? "—"}
            mono
          />
        </dl>

        {summary.shortlist.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              Shortlist
            </p>
            <ul className="border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {summary.shortlist.map((s) => (
                <li
                  key={s.opportunityNumber}
                  className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-3 py-2"
                >
                  <span className="font-mono text-xs text-[var(--color-muted-foreground)] tabular-nums">
                    {s.score}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs truncate">{decodeHtml(s.title)}</p>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
                      {s.opportunityNumber}
                    </p>
                  </div>
                  <VerdictPill verdict={s.verdict} blockers={s.blockers.length} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
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
    <div className="p-3 border-r last:border-r-0 border-[var(--color-border)]">
      <dt className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className={mono ? "mt-1 text-xs font-mono truncate" : "mt-1 text-sm tabular-nums"}>
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
