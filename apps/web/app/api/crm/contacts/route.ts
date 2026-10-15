/**
 * GET /api/crm/contacts — list contacts (ADMIN — internal pipeline view).
 * Substrate shim for @nexus/crm-and-lifecycle (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleListContacts } from "@nexus/crm-and-lifecycle";
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
  const stage = url.searchParams.get("stage") ?? undefined;
  const owner_user_id = url.searchParams.get("owner_user_id") ?? undefined;
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const result = await handleListContacts(
    { db: buildDb(), events: buildEventBus() },
    { stage, owner_user_id, limit },
  );
  return respond(result);
}
