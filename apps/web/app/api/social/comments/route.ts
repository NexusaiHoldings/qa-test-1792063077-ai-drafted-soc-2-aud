/**
 * /api/social/comments — list (GET) / post (POST) comments on an entity.
 * Substrate shim for @nexus/social-and-engagement (substrate-lego-wiring-001 Phase 3).
 * GET is public (read); POST requires login and attributes author from session.
 * CommentThread is exported for companies to embed on their entity pages.
 */
import { NextResponse } from "next/server";
import { handleListComments, handlePostComment } from "@nexus/social-and-engagement";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const result = await handleListComments(
    { db: buildDb(), events: buildEventBus() },
    {
      entity_type: url.searchParams.get("entity_type") ?? undefined,
      entity_id: url.searchParams.get("entity_id") ?? undefined,
    },
  );
  return respond(result);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handlePostComment(
    { db: buildDb(), events: buildEventBus() },
    { ...body, author_id: user.id },
  );
  return respond(result);
}
