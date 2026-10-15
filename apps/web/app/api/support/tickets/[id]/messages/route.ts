/**
 * POST /api/support/tickets/[id]/messages — append a message to a ticket.
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 * author is the session user (author_type "user").
 */
import { NextResponse } from "next/server";
import { handleAppendMessage } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleAppendMessage(
    { db: buildDb(), events: buildEventBus() },
    params.id,
    { ...body, author_type: "user", author_id: user.id, is_internal: false },
  );
  return respond(result);
}
