/**
 * POST /api/orgs/accept — accept an org invitation (by token).
 * Substrate shim for @nexus/organizations-and-teams (substrate-lego-wiring-001).
 * user_id is taken from the session, never the request body.
 */
import { NextResponse } from "next/server";
import { handleAcceptInvitation } from "@nexus/organizations-and-teams";
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
  const result = await handleAcceptInvitation(
    { db: buildDb(), events: buildEventBus() },
    { token: body.token, user_id: user.id },
  );
  return respond(result);
}
