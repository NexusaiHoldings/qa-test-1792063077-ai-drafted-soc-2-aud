/**
 * POST /api/dev/keys/[id]/revoke — revoke an API key.
 * Substrate shim for @nexus/developer-surface (substrate-lego-wiring-001 Phase 3).
 */
import { NextResponse } from "next/server";
import { handleRevokeKey } from "@nexus/developer-surface";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleRevokeKey(
    { db: buildDb(), events: buildEventBus() },
    params.id,
    body,
  );
  return respond(result);
}
