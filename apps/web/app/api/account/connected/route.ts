/**
 * GET /api/account/connected — list the session user's connected accounts.
 * Substrate shim for @nexus/profile-and-account (substrate-lego-wiring-001).
 * Read-only: connect/disconnect is not built in v1 (no panel UI mounted).
 */
import { NextResponse } from "next/server";
import { handleListConnectedAccounts } from "@nexus/profile-and-account";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleListConnectedAccounts(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}
