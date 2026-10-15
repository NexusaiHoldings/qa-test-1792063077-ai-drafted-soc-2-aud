/**
 * GET /api/dev/webhooks — list the session user's webhooks (read-only v1).
 * Substrate shim for @nexus/developer-surface (substrate-lego-wiring-001 Phase 3).
 */
import { NextResponse } from "next/server";
import { handleListWebhooks } from "@nexus/developer-surface";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleListWebhooks(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}
