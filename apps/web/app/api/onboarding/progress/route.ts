/**
 * GET /api/onboarding/progress — the session user's onboarding progress.
 * Substrate shim for @nexus/onboarding (substrate-lego-wiring-001 Phase 3).
 */
import { NextResponse } from "next/server";
import { handleGetProgress } from "@nexus/onboarding";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleGetProgress(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}
