import type { Provenance } from "@/lib/types";

export function ProvenanceLine({
  prov,
  prefix,
}: {
  prov: Provenance;
  prefix?: string;
}) {
  return (
    <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] uppercase tracking-wider">
      {prefix && <>{prefix} · </>}
      {prov.rung}/{prov.model} · {prov.latencyMs}ms · ${prov.costUSD.toFixed(4)}
    </p>
  );
}
