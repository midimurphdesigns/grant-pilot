# Sub-agent envelope contract

Every sub-agent (`discovery`, `eligibility`, `drafter`) returns the same shape:

```ts
type SubAgentEnvelope<T> = {
  result: T;
  provenance: {
    rung: string;       // "primary" | "fallback"
    model: string;      // "claude-sonnet-4-6" | "claude-haiku-4-5"
    latencyMs: number;
    costUSD: number;
    attempts: { rung: string; error: string }[];
  };
};
```

`T` is sub-agent-specific (`DiscoveryResult`, `EligibilityResult`, `DrafterResult`), each a discriminated union with a `kind` field so the planner pattern-matches on it instead of inspecting types.

## Why this shape

- **Provenance per call** — the renderer can show "this sub-agent answered with Sonnet 4.6 in 4.2s for $0.018" alongside the result. That's the visible proof of the fallback ladder; a transcript without it just looks like prose.
- **Cost telemetry stacks** — the planner sums `provenance.costUSD` across all sub-agent calls to produce `summary.totalCostUSD`, which the daily-budget cap consumes.
- **Failure modes are values, not exceptions** — when a sub-agent fails, `result.kind === "error"` (or similar). The planner sees the failure, can decide whether to skip / retry / stop, and writes it into the transcript as a `decision` step. Nothing throws.

## Where this matters most

The `eligibility` sub-agent has TWO data sources (`grant_detail` from grants.gov, optional `entity_lookup` from SAM.gov) plus a model call. The envelope lets it report provenance for whichever rung answered the model call without leaking the underlying tool calls into the transcript. Tool calls are noise; sub-agent decisions are signal.

## Adding a new sub-agent

If a future session adds a fourth sub-agent (resist this — see ADR-003), it must:
1. Return `SubAgentEnvelope<NewResult>` where `NewResult` is a discriminated union with at least `kind: "error"` for failures
2. Wrap its model calls in `callLadder` so provenance is consistent
3. Be added to `TranscriptStep` in `planner.ts` so the renderer knows about it
