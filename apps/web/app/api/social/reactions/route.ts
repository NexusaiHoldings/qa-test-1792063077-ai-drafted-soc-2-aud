/**
 * POST /api/social/reactions — react to an entity (toggle).
 * Substrate shim for @nexus/social-and-engagement (substrate-lego-wiring-001 Phase 3).
 * user_id is taken from the session.
 */
import { NextResponse } from "next/server";
import { handleReact } from "@nexus/social-and-engagement";
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
  const result = await handleReact(
    { db: buildDb(), events: buildEventBus() },
    { ...body, user_id: user.id },
  );
  return respond(result);
}
