/**
 * POST /api/orgs/[orgId]/invite — invite a member (seat-aware).
 * Substrate shim for @nexus/organizations-and-teams (substrate-lego-wiring-001).
 * invited_by is taken from the session, never the request body.
 */
import { NextResponse } from "next/server";
import { handleInviteMember } from "@nexus/organizations-and-teams";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { orgId: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleInviteMember(
    { db: buildDb(), events: buildEventBus() },
    params.orgId,
    { ...body, invited_by: user.id },
  );
  return respond(result);
}
