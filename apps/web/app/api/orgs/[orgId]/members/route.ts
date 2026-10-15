/**
 * GET /api/orgs/[orgId]/members — list members of an org.
 * Substrate shim for @nexus/organizations-and-teams (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleListMembers } from "@nexus/organizations-and-teams";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { orgId: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleListMembers(
    { db: buildDb(), events: buildEventBus() },
    params.orgId,
  );
  return respond(result);
}
