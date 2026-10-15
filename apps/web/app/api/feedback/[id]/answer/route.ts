/**
 * POST /api/feedback/[id]/answer — admin answers the pipeline's clarifying
 * question (admin-gated). Substrate shim for @nexus/feedback
 * (feedback-to-build-loop-001). Forwards `feedback.answer` to the runtime.
 */
import { NextResponse } from "next/server";
import { handleAnswer } from "@nexus/feedback";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { requireAdmin } from "@/lib/admin-api";
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
  const result = await handleAnswer(
    { db: buildDb(), events: buildEventBus() },
    { id: params.id, answer: body.answer, actor: g.admin.email },
  );
  return respond(result);
}
