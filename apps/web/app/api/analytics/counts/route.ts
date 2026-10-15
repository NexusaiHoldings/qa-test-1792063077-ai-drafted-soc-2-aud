/**
 * GET /api/analytics/counts — event counts over a window (ADMIN).
 * Substrate shim for @nexus/analytics-and-telemetry (substrate-lego-wiring-001 Phase 4).
 */
import { NextResponse } from "next/server";
import { handleEventCounts } from "@nexus/analytics-and-telemetry";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getAdminUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? undefined;
  const days = Number(url.searchParams.get("days")) || undefined;
  const result = await handleEventCounts(
    { db: buildDb(), events: buildEventBus() },
    { name, days },
  );
  return respond(result);
}
