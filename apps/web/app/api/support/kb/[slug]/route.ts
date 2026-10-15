/**
 * GET /api/support/kb/[slug] — fetch one published KB article (public).
 * Substrate shim for @nexus/support-and-help (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleGetArticle } from "@nexus/support-and-help";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } },
): Promise<NextResponse> {
  const result = await handleGetArticle(
    { db: buildDb(), events: buildEventBus() },
    params.slug,
  );
  return respond(result);
}
