/**
 * GET /api/files — list the session user's files.
 * Substrate shim for @nexus/files-and-media (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleListFiles } from "@nexus/files-and-media";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleListFiles(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}
