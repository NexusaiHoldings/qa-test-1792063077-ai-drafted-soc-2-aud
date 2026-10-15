/**
 * POST /api/account/export — request a GDPR data export for the session user.
 * Substrate shim for @nexus/profile-and-account (substrate-lego-wiring-001).
 * user_id always comes from the session.
 */
import { NextResponse } from "next/server";
import { handleRequestExport } from "@nexus/profile-and-account";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleRequestExport(
    { db: buildDb(), events: buildEventBus() },
    { ...body, user_id: user.id },
  );
  return respond(result);
}
