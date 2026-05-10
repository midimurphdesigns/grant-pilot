import { cn } from "@/lib/utils";

export function ScoreBadge({ score }: { score: number }) {
  let cls = "border-[var(--color-border)] text-[var(--color-muted-foreground)]";
  if (score >= 80) cls = "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]";
  else if (score >= 50) cls = "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]";
  else if (score >= 30) cls = "border-yellow-400/40 bg-yellow-400/10 text-yellow-300";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-[2.5rem] items-center justify-center border px-2 text-xs font-mono tabular-nums",
        cls,
      )}
      aria-label={`Score ${score} of 100`}
    >
      {score}
    </span>
  );
}
