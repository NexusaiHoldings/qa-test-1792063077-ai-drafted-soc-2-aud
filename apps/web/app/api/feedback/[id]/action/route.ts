/**
 * POST /api/feedback/[id]/action — admin acts on a feedback item (admin-gated).
 * Substrate shim for @nexus/feedback (feedback-to-build-loop-001).
 *
 * Build / Revise / Discuss / Decline. High-risk items (triage.requiresChairman)
 * require the actor to be an allow-listed chairman (isChairmanEmail). Build/Revise
 * forward `feedback.action` to the runtime which fires the change-request pipeline.
 */
import { NextResponse } from "next/server";
import { handleFeedbackAction } from "@nexus/feedback";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { requireAdmin } from "@/lib/admin-api";
import { isChairmanEmail } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const body = await request.json().catch(() => ({}));
  const result = await handleFeedbackAction(
    { db: buildDb(), events: buildEventBus() },
    {
      id: params.id,
      action: body.action,
      note: body.note,
      actor: g.admin.email,
      isChairman: isChairmanEmail(g.admin.email),
    },
  );
  return respond(result);
}
