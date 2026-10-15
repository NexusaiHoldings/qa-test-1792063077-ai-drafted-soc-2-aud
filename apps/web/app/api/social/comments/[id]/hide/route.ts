/**
 * POST /api/social/comments/[id]/hide — hide a comment (ADMIN moderation).
 * Substrate shim for @nexus/social-and-engagement (substrate-lego-wiring-001 Phase 3).
 */
import { NextResponse } from "next/server";
import { handleHideComment } from "@nexus/social-and-engagement";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getAdminUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const result = await handleHideComment(
    { db: buildDb(), events: buildEventBus() },
    params.id,
    body,
  );
  return respond(result);
}

