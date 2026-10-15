/**
 * POST /api/legal/cookies/consent — substrate shim for @nexus/legal-and-compliance
 * (legal-surface-mount-001). Records a cookie-consent decision. Consumed by the
 * lego's CookieBanner client component.
 */
import { NextResponse } from "next/server";
import { handleGiveConsent } from "@nexus/legal-and-compliance";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const result = await handleGiveConsent({
    userId: null,
    body,
    anonymousIdHeader: request.headers.get("x-anonymous-id"),
    ipAddress: request.headers.get("x-forwarded-for"),
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
