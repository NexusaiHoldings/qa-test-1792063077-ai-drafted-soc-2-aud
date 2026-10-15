/**
 * /api/support/tickets — list the session user's tickets (GET) / open a ticket (POST).
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 * user attribution comes from the session; anonymous tickets are allowed.
 */
import { NextResponse } from "next/server";
import { handleListTickets, handleCreateTicket } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const result = await handleListTickets(
    { db: buildDb(), events: buildEventBus() },
    { user_id: user.id, status, limit },
  );
  return respond(result);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  const result = await handleCreateTicket(
    { db: buildDb(), events: buildEventBus() },
    {
      ...body,
      user_id: user?.id ?? body.user_id ?? null,
      // Reply-ability: session email wins; anonymous tickets carry the
      // widget-supplied email (operations support loop drafts + sends replies).
      email: user?.email ?? body.email ?? null,
    },
  );
  return respond(result);
}
