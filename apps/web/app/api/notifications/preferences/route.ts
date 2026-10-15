/**
 * GET/PUT /api/notifications/preferences — read/update the current user's
 * notification preference matrix. Substrate shim for @nexus/notifications
 * (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleGetPreferences, handleSetPreferences } from "@nexus/notifications";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toResponse(result: { status: number; body: string | Record<string, unknown>; headers?: Record<string, string> }): NextResponse {
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  return toResponse(await handleGetPreferences({
    userId: user?.id ?? null,
    ctx: { db: buildDb(), events: buildEventBus() },
  }));
}

export async function PUT(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  return toResponse(await handleSetPreferences({
    userId: user?.id ?? null,
    body,
    ctx: { db: buildDb(), events: buildEventBus() },
  }));
}
