/**
 * /api/run — streaming agent endpoint.
 *
 * Two modes:
 *   - Preset:  body { intentId } — runs one of the 5 verified intents,
 *              over-cap falls back to that intent's recording.
 *   - Custom:  body { customIntent, customProfile } — runs the visitor's
 *              free-text intent against their structured profile (every
 *              field bounded by enum/regex/range — no injection surface
 *              outside the intent text + missionDescription which both
 *              go through the same heuristic filter).
 *
 * Response is NDJSON: one JSON object per line.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CUSTOM_INTENT_MAX_CHARS,
  CUSTOM_INTENT_MIN_CHARS,
  CustomProfileSchema,
  findIntent,
  rejectionReason,
} from "@/lib/allowlist";
import { reserveSpend, reconcileSpend } from "@/lib/budget";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getReplay } from "@/lib/replay";

import { runPlanner } from "@grant-pilot/agent/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.union([
  z.object({
    intentId: z.string().min(1),
  }),
  z.object({
    customIntent: z.string().min(CUSTOM_INTENT_MIN_CHARS).max(CUSTOM_INTENT_MAX_CHARS),
    customProfile: CustomProfileSchema,
  }),
]);

function ndjson(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", reason: parsed.error.errors[0]?.message ?? "validation failed" },
      { status: 400 },
    );
  }

  let resolvedIntentText: string;
  let resolvedProfile:
    | NonNullable<ReturnType<typeof findIntent>>["profile"]
    | z.infer<typeof CustomProfileSchema>;
  let displayIntent: {
    id: string;
    intent: string;
    profile: typeof resolvedProfile;
  };
  let isCustom = false;

  if ("intentId" in parsed.data) {
    const found = findIntent(parsed.data.intentId);
    if (!found) {
      return NextResponse.json({ error: "intent not in allowlist" }, { status: 403 });
    }
    resolvedIntentText = found.intent;
    resolvedProfile = found.profile;
    displayIntent = found;
  } else {
    // Custom mode — run rejection filter on intent + missionDescription.
    const intentReason = rejectionReason(parsed.data.customIntent);
    if (intentReason) {
      return NextResponse.json({ error: "rejected", reason: intentReason }, { status: 400 });
    }
    if (parsed.data.customProfile.missionDescription) {
      const missionReason = rejectionReason(parsed.data.customProfile.missionDescription);
      if (missionReason) {
        return NextResponse.json(
          { error: "rejected", reason: `mission description: ${missionReason}` },
          { status: 400 },
        );
      }
    }
    resolvedIntentText = parsed.data.customIntent.trim();
    resolvedProfile = parsed.data.customProfile;
    displayIntent = {
      id: "custom",
      intent: resolvedIntentText,
      profile: parsed.data.customProfile,
    };
    isCustom = true;
  }

  // Rate-limit before any model call. Fails closed in production if
  // Upstash is unreachable — see lib/rate-limit.ts.
  const ip = clientIp(req.headers);
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "rate-limited",
        remaining: rl.remaining,
        resetMs: rl.resetMs,
        reason: rl.configured
          ? undefined
          : "Rate limiter unavailable. The hosted demo guards live API spend behind a per-IP limit, and the guard is currently offline. Try again later or read the recordings on the GitHub repo.",
      },
      { status: 429 },
    );
  }

  // Atomically reserve an upper-bound spend amount BEFORE running the
  // agent. This is the gate: concurrent callers serialize on the Redis
  // INCRBYFLOAT, so no two requests can both observe a sub-cap counter
  // and both proceed. The actual cost is reconciled after the run via
  // reconcileSpend(reserved, actual) in the stream's finally block.
  //
  // For replay path (preset over-cap), reservation is not required —
  // serving a static JSON recording costs nothing.
  const reservation = await reserveSpend();

  // Over cap (reservation refused) on PRESET mode — serve that intent's
  // recording with a banner.
  if (!reservation.granted && !isCustom && "intentId" in parsed.data) {
    const replay = getReplay(parsed.data.intentId);
    return NextResponse.json({
      mode: "replay",
      reason: reservation.configured
        ? `Daily budget cap of $${reservation.capUSD} hit ` +
          `($${reservation.postReservationSpentUSD.toFixed(2)} spent). ` +
          `Serving the most recent recorded run for this intent. Live runs resume tomorrow UTC.`
        : `Budget guard is offline. Serving the most recent recorded run for this intent.`,
      intent: displayIntent,
      run: replay?.run ?? null,
    });
  }

  // Over cap on CUSTOM mode — refuse, no recording exists.
  if (!reservation.granted && isCustom) {
    return NextResponse.json(
      {
        error: "over-cap",
        reason: reservation.configured
          ? `Daily budget cap of $${reservation.capUSD} hit ` +
            `($${reservation.postReservationSpentUSD.toFixed(2)} spent). ` +
            `Custom-intent runs are paused until tomorrow UTC. The 5 preset intents are still ` +
            `available — they fall back to recorded runs.`
          : `Budget guard is offline. Custom-intent runs are paused. Preset intents fall back to recordings.`,
      },
      { status: 503 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    if (isCustom) {
      return NextResponse.json(
        { error: "no-key", reason: "Live mode is not configured on this deployment." },
        { status: 503 },
      );
    }
    if ("intentId" in parsed.data) {
      const replay = getReplay(parsed.data.intentId);
      return NextResponse.json({
        mode: "replay",
        reason: "Live key not configured — serving recorded run.",
        intent: displayIntent,
        run: replay?.run ?? null,
      });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(ndjson(obj)));

      send({ kind: "meta", mode: "live", intent: displayIntent, isCustom });
      // Phase markers help the UI show "discovering / checking eligibility / drafting"
      // without parsing the inner step shape.
      send({ kind: "phase", phase: "discovery" });

      try {
        // Run the planner. It already emits steps in order; we re-broadcast
        // each one + a phase marker so the UI can render cleanly.
        //
        // All three sub-agents stream. The AI SDK exposes three different
        // streaming primitives, each suited to a different job:
        //
        //   - streamObject for Discovery + Eligibility — the Zod schema
        //     constrains the shape and `partialObjectStream` lets the UI
        //     render the shortlist building one entry at a time and the
        //     verdict badge resolving in ~50 tokens.
        //   - streamText for Drafter — token-by-token prose with mid-
        //     generation tool calls via maxSteps.
        //
        // The planner forwards each sub-agent's partial as it arrives
        // and we re-emit as NDJSON events the UI accumulates into tiles.
        const run = await runPlanner({
          intent: resolvedIntentText,
          profile: resolvedProfile,
          onDiscoveryPartial: (partial) => {
            send({ kind: "discovery-partial", partial });
          },
          onEligibilityPartial: (partial) => {
            send({
              kind: "eligibility-partial",
              opportunityNumber: partial.opportunityNumber,
              partial,
            });
          },
          onDrafterPartial: (partial, opportunityNumber) => {
            send({
              kind: "draft-partial",
              opportunityNumber,
              partial,
            });
          },
        });
        let lastKind: string | null = null;
        for (const step of run.steps) {
          // Coarse phase changes between sub-agents.
          if (step.kind === "eligibility" && lastKind !== "eligibility") {
            send({ kind: "phase", phase: "eligibility" });
          } else if (step.kind === "drafter" && lastKind !== "drafter") {
            send({ kind: "phase", phase: "drafter" });
          }
          lastKind = step.kind;
          send({ kind: "step", step });
        }
        send({ kind: "summary", summary: run.summary });
        // Reconcile the reservation with the actual cost. For a typical
        // $0.10 run reserved at $0.30, this releases $0.20 back into the
        // daily cap. For overshoots, it adds the delta. Reservation is
        // already counted at this point either way.
        await reconcileSpend(reservation.reservedUSD, run.summary.totalCostUSD);
      } catch (err) {
        send({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        // Run failed mid-stream. Refund the reservation since no actual
        // spend was committed (or only a partial amount we can't easily
        // know). Reconciling to $0 is the safe direction — it releases
        // the reservation and slightly under-counts a partial-run cost,
        // which is preferable to permanently parking the reservation.
        await reconcileSpend(reservation.reservedUSD, 0);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
