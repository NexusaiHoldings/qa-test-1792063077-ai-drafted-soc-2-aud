/**
 * GET /api/billing/subscription — current user's subscription.
 * Substrate shim for @nexus/billing-and-subscriptions (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleGetSubscription } from "@nexus/billing-and-subscriptions";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  const result = await handleGetSubscription({
    userId: user?.id ?? null,
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
