import { NextResponse } from "next/server";

import { getBudgetStatus } from "@/lib/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getBudgetStatus();
  return NextResponse.json(status);
}
