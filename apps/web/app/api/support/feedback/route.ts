/**
 * POST /api/support/feedback — submit CSAT feedback for a ticket.
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleSubmitFeedback } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  const result = await handleSubmitFeedback(
    { db: buildDb(), events: buildEventBus() },
    { ...body, user_id: user?.id ?? body.user_id ?? null },
  );
  return respond(result);
}
