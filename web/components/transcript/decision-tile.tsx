import { GitBranch } from "lucide-react";

export function DecisionTile({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 border-l-2 border-[var(--color-primary)]/40 bg-white/[0.02] text-xs leading-5">
      <GitBranch
        aria-hidden
        className="size-3.5 text-[var(--color-primary)]/70 mt-0.5 shrink-0"
      />
      <span className="text-[var(--color-muted-foreground)]">
        <span className="font-mono uppercase tracking-wider text-[10px] mr-2">decision</span>
        {message}
      </span>
    </div>
  );
}
