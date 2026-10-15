/**
 * GET /api/support/kb/search?q=… — search published KB articles (public).
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 * Static segment — Next.js prefers this over the sibling [slug] route.
 */
import { NextResponse } from "next/server";
import { handleSearchArticles } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const result = await handleSearchArticles(
    { db: buildDb(), events: buildEventBus() },
    { q, limit },
  );
  return respond(result);
}
