/**
 * POST /api/notifications/web-push/register — register a web-push subscription.
 * Substrate shim for @nexus/notifications (substrate-lego-wiring-001).
 * (Web-push *delivery* is deferred v1; registration persists the subscription.)
 */
import { NextResponse } from "next/server";
import { handleRegisterWebPush } from "@nexus/notifications";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  const result = await handleRegisterWebPush({
    userId: user?.id ?? null,
    body,
    userAgent: request.headers.get("user-agent"),
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
