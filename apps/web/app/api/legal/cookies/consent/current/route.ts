/**
 * GET /api/legal/cookies/consent/current — substrate shim for
 * @nexus/legal-and-compliance (legal-surface-mount-001). Returns the visitor's
 * current cookie consent (or { consent: null }). Consumed by the lego's
 * CookieBanner to decide whether to show.
 */
import { NextResponse } from "next/server";
import { handleGetCurrentConsent } from "@nexus/legal-and-compliance";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const result = await handleGetCurrentConsent({
    userId: null,
    anonymousIdHeader: request.headers.get("x-anonymous-id"),
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
