/**
 * POST /api/notifications/inbox/[id]/read — mark an inbox item read.
 * Substrate shim for @nexus/notifications (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleMarkRead } from "@nexus/notifications";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  const result = await handleMarkRead({
    userId: user?.id ?? null,
    notificationId: params.id,
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
