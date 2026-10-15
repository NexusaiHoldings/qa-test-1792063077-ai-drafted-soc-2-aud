/**
 * GET /api/analytics/summary — one rich aggregate for the admin dashboard
 * (ADMIN). Substrate shim for @nexus/analytics-and-telemetry
 * (product-flywheel-001 analytics-lego deepening).
 */
import { NextResponse } from "next/server";
import { handleAnalyticsSummary } from "@nexus/analytics-and-telemetry";
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
  const days = Number(url.searchParams.get("days")) || undefined;
  const result = await handleAnalyticsSummary(
    { db: buildDb(), events: buildEventBus() },
    { days },
  );
  return respond(result);
}
