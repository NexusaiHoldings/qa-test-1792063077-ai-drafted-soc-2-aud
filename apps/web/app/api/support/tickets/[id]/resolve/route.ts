/**
 * POST /api/support/tickets/[id]/resolve — mark a ticket resolved.
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleResolveTicket } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleResolveTicket(
    { db: buildDb(), events: buildEventBus() },
    params.id,
  );
  return respond(result);
}
