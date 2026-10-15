/**
 * POST /api/analytics/events — record an analytics event (PUBLIC).
 * Substrate shim for @nexus/analytics-and-telemetry (substrate-lego-wiring-001 Phase 4).
 * Public so the client AnalyticsBeacon can record page_view for anonymous
 * visitors; user_id is attributed from the session when present.
 */
import { NextResponse } from "next/server";
import { handleRecordEvent } from "@nexus/analytics-and-telemetry";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  const result = await handleRecordEvent(
    { db: buildDb(), events: buildEventBus() },
    { ...body, user_id: user?.id ?? body.user_id ?? null },
  );
  return respond(result);
}
