/**
 * GET /api/notifications/inbox — substrate shim for @nexus/notifications
 * (substrate-lego-wiring-001). Returns the current user's in-app inbox.
 */
import { NextResponse } from "next/server";
import { handleInbox } from "@nexus/notifications";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  const result = await handleInbox({
    userId: user?.id ?? null,
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
