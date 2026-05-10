/**
 * /api/run — streaming agent endpoint.
 *
 * Validates intent against allowlist → checks per-IP rate limit →
 * checks daily budget cap. If under cap, runs the planner live and
 * streams TranscriptStep events as they complete. If over cap, returns
 * the recorded run for the same intent with a banner explaining why.
 *
 * Response is NDJSON: one JSON object per line. The client splits on
 * newlines and renders each step as it arrives.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findIntent } from "@/lib/allowlist";
import { getBudgetStatus, recordSpend } from "@/lib/budget";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getReplay } from "@/lib/replay";

import { runPlanner } from "@grant-pilot/agent/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  intentId: z.string().min(1),
});

function ndjson(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const intent = findIntent(parsed.data.intentId);
  if (!intent) {
    return NextResponse.json({ error: "intent not in allowlist" }, { status: 403 });
  }

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

  // Over cap — serve the recording with a banner.
  if (budget.overCap) {
    const replay = getReplay(intent.id);
    return NextResponse.json({
      mode: "replay",
      reason:
        `Daily budget cap of $${budget.capUSD} hit ($${budget.spentUSD.toFixed(2)} spent). ` +
        `Serving the most recent recorded run for this intent. Live runs resume tomorrow UTC.`,
      intent,
      run: replay?.run ?? null,
    });
  }

  // No Anthropic key configured — also fall back to replay so the demo
  // never 500s in front of strangers.
  if (!process.env.ANTHROPIC_API_KEY) {
    const replay = getReplay(intent.id);
    return NextResponse.json({
      mode: "replay",
      reason: "Live key not configured — serving recorded run.",
      intent,
      run: replay?.run ?? null,
    });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(ndjson(obj)));

      send({ kind: "meta", mode: "live", intent });

      try {
        const run = await runPlanner({
          client,
          intent: intent.intent,
          profile: intent.profile,
        });
        for (const step of run.steps) {
          send({ kind: "step", step });
        }
        send({ kind: "summary", summary: run.summary });
        // Increment budget AFTER successful completion.
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
