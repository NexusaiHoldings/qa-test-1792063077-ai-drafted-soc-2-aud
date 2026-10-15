/**
 * PATCH /api/feedback/[id] — Nexus sync write path (feedback-to-build-loop-001).
 *
 * The portfolio-runtime writes triage results, status reconciliation, and
 * clarifying questions back into this company's feedback row. This is a
 * SERVER-TO-SERVER call gated by the per-company runtime token
 * (RUNTIME_AUTH_TOKEN — the same token the substrate uses to call the runtime,
 * so the channel is symmetric), NOT a session/admin cookie. Constant-time
 * compared. Returns 503 when the token isn't configured (never authorize an
 * unconfigured deployment).
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleSyncFeedback } from "@nexus/feedback";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t.length > 0 ? t : null;
}

function tokenOk(provided: string): boolean {
  const expected = process.env.RUNTIME_AUTH_TOKEN || "";
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!process.env.RUNTIME_AUTH_TOKEN) {
    return NextResponse.json({ error: "sync not configured" }, { status: 503 });
  }
  const token = bearer(request);
  if (!token || !tokenOk(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const result = await handleSyncFeedback(
    { db: buildDb(), events: buildEventBus() },
    { id: params.id, patch: body && typeof body === "object" ? body : {} },
  );
  return respond(result);
}
