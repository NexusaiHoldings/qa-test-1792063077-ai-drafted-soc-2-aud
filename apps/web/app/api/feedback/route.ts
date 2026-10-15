/**
 * /api/feedback — submit feedback (POST, any signed-in user) / list (GET, admin).
 * Substrate shim for @nexus/feedback (feedback-to-build-loop-001).
 *
 * POST is gated to signed-in users (the FAB only shows when signed in). GET is
 * admin-gated (the /admin/feedback triage tab). Submit forwards
 * `feedback.submitted` to the portfolio-runtime via buildEventBus().
 */
import { NextResponse } from "next/server";
import { handleSubmitFeedback, handleListFeedback } from "@nexus/feedback";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser, isChairmanEmail } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/admin-api";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await handleSubmitFeedback(
    { db: buildDb(), events: buildEventBus() },
    {
      type: body.type,
      description: body.description,
      page: body.page,
      user: { id: user.id, email: user.email, name: user.email },
    },
  );
  return respond(result);
}

export async function GET(request: Request): Promise<NextResponse> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const result = await handleListFeedback(
    { db: buildDb(), events: buildEventBus() },
    { status, limit },
  );
  // Attach the viewer's identity so the UI can render the high-risk approval
  // state correctly (only a chairman may approve high-risk Builds).
  if (result.status === 200 && typeof result.body === "object" && result.body) {
    return NextResponse.json({
      ...(result.body as Record<string, unknown>),
      viewer: { email: g.admin.email, isChairman: isChairmanEmail(g.admin.email) },
    });
  }
  return respond(result);
}
