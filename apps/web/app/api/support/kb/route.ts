/**
 * GET /api/support/kb — list published knowledge-base articles (public).
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleListArticles } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const result = await handleListArticles(
    { db: buildDb(), events: buildEventBus() },
    { category, limit },
  );
  return respond(result);
}
