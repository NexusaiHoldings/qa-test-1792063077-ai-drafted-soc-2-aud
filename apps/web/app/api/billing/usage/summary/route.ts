/**
 * GET /api/billing/usage/summary — current-period usage aggregation.
 * Substrate shim for @nexus/billing-and-subscriptions (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleGetUsageSummary } from "@nexus/billing-and-subscriptions";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  const result = await handleGetUsageSummary({
    userId: user?.id ?? null,
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
