/**
 * /api/run — streaming agent endpoint.
 *
 * Two modes:
 *   - Preset:  body { intentId } — runs one of the 5 verified intents,
 *              over-cap falls back to that intent's recording.
 *   - Custom:  body { customIntent, profileId } — runs the visitor's
 *              free-text intent against a preset profile. Subject to
 *              the same per-IP rate limit and daily budget cap. No
 *              recording fallback (we never recorded their input);
 *              over-cap returns 503 with a banner.
 *
 * Hard guardrails on custom mode (in lib/allowlist.ts):
 *   - 20-600 char length window
 *   - Profile is preset-only (never free-texted) — eliminates the
 *     structured prompt-injection surface
 *   - Heuristic rejection of common jailbreak phrases pre-LLM
 *
 * Response is NDJSON: one JSON object per line. The client splits on
 * newlines and renders each step as it arrives.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CUSTOM_INTENT_MAX_CHARS,
  CUSTOM_INTENT_MIN_CHARS,
  findIntent,
  rejectionReason,
} from "@/lib/allowlist";
import { getBudgetStatus, recordSpend } from "@/lib/budget";
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
    profileId: z.string().min(1),
  }),
]);

function ndjson(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Resolve the intent + profile we'll actually run against.
  let resolvedIntentText: string;
  let resolvedProfile: ReturnType<typeof findIntent> extends infer T
    ? T extends { profile: infer P }
      ? P
      : never
    : never;
  let displayIntent: ReturnType<typeof findIntent>;
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
    const reason = rejectionReason(parsed.data.customIntent);
    if (reason) {
      return NextResponse.json({ error: "rejected", reason }, { status: 400 });
    }
    const profile = findIntent(parsed.data.profileId);
    if (!profile) {
      return NextResponse.json({ error: "profile not in allowlist" }, { status: 403 });
    }
    resolvedIntentText = parsed.data.customIntent.trim();
    resolvedProfile = profile.profile;
    displayIntent = {
      id: `custom__${profile.id}`,
      intent: resolvedIntentText,
      profile: profile.profile,
    };
    isCustom = true;
  }

  // Rate-limit BEFORE any model call.
  const ip = clientIp(req.headers);
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "rate-limited",
        remaining: rl.remaining,
        resetMs: rl.resetMs,
      },
      { status: 429 },
    );
  }

  const budget = await getBudgetStatus();

  // Over cap on PRESET mode — serve that intent's recording with a banner.
  if (budget.overCap && !isCustom && displayIntent) {
    const replay = getReplay(displayIntent.id);
    return NextResponse.json({
      mode: "replay",
      reason:
        `Daily budget cap of $${budget.capUSD} hit ($${budget.spentUSD.toFixed(2)} spent). ` +
        `Serving the most recent recorded run for this intent. Live runs resume tomorrow UTC.`,
      intent: displayIntent,
      run: replay?.run ?? null,
    });
  }

  // Over cap on CUSTOM mode — no recording exists for the visitor's input,
  // so we have to refuse rather than mislead.
  if (budget.overCap && isCustom) {
    return NextResponse.json(
      {
        error: "over-cap",
        reason:
          `Daily budget cap of $${budget.capUSD} hit ($${budget.spentUSD.toFixed(2)} spent). ` +
          `Custom-intent runs are paused until tomorrow UTC. The 5 preset intents are still ` +
          `available — they fall back to recorded runs.`,
      },
      { status: 503 },
    );
  }

  // No Anthropic key configured — preset mode falls back to recording,
  // custom mode 503s.
  if (!process.env.ANTHROPIC_API_KEY) {
    if (isCustom) {
      return NextResponse.json(
        { error: "no-key", reason: "Live mode is not configured on this deployment." },
        { status: 503 },
      );
    }
    if (displayIntent) {
      const replay = getReplay(displayIntent.id);
      return NextResponse.json({
        mode: "replay",
        reason: "Live key not configured — serving recorded run.",
        intent: displayIntent,
        run: replay?.run ?? null,
      });
    }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(ndjson(obj)));

      send({ kind: "meta", mode: "live", intent: displayIntent, isCustom });

      try {
        const run = await runPlanner({
          client,
          intent: resolvedIntentText,
          profile: resolvedProfile,
        });
        for (const step of run.steps) {
          send({ kind: "step", step });
        }
        send({ kind: "summary", summary: run.summary });
        await recordSpend(run.summary.totalCostUSD);
      } catch (err) {
        send({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
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
