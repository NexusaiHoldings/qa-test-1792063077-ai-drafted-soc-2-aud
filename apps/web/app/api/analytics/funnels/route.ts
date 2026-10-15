/**
 * GET /api/analytics/funnels — configured conversion funnels (ADMIN).
 * Substrate shim for @nexus/analytics-and-telemetry (substrate-lego-wiring-001 Phase 4).
 */
import { NextResponse } from "next/server";
import { handleListFunnels } from "@nexus/analytics-and-telemetry";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getAdminUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const result = await handleListFunnels({ db: buildDb(), events: buildEventBus() });
  return respond(result);
}
