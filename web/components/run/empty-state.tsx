import { FileSearch } from "lucide-react";

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-[var(--color-border)] p-8 min-h-[160px] text-xs text-[var(--color-muted-foreground)] flex flex-col items-center justify-center gap-3">
      <FileSearch aria-hidden className="size-6 opacity-50" />
      <p className="text-center max-w-md leading-5">{message}</p>
    </div>
  );
}
