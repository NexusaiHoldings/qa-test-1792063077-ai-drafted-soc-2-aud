/**
 * /api/search/saved — list (GET) / save (POST) the session user's saved searches.
 * Substrate shim for @nexus/search (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleListSavedSearches, handleSaveSearch } from "@nexus/search";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleListSavedSearches(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleSaveSearch(
    { db: buildDb(), events: buildEventBus() },
    { ...body, user_id: user.id },
  );
  return respond(result);
}
