/**
 * POST /api/crm/contacts/[id]/score — apply a lead score (ADMIN).
 * Substrate shim for @nexus/crm-and-lifecycle (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleApplyScore } from "@nexus/crm-and-lifecycle";
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
  const result = await handleApplyScore(
    { db: buildDb(), events: buildEventBus() },
    params.id,
    body,
  );
  return respond(result);
}
