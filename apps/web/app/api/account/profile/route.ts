/**
 * /api/account/profile — get (GET) / upsert (PUT) the session user's profile.
 * Substrate shim for @nexus/profile-and-account (substrate-lego-wiring-001).
 * user_id always comes from the session, never the request — a user can only
 * read/write their own profile.
 */
import { NextResponse } from "next/server";
import { handleGetProfile, handleUpdateProfile } from "@nexus/profile-and-account";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleGetProfile(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}

export async function PUT(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleUpdateProfile(
    { db: buildDb(), events: buildEventBus() },
    { ...body, user_id: user.id },
  );
  return respond(result);
}
