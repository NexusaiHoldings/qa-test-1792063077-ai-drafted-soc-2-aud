/**
 * PATCH /api/admin/users/[id] — change a user's status (admin-users-001).
 *
 * Body: { status: "active" | "disabled" }. Admin-gated. Guards against an admin
 * disabling their own account (would lock themselves out).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { buildDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  let body: { status?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body tolerated */
  }
  const status = body.status;
  if (status !== "active" && status !== "disabled") {
    return NextResponse.json({ error: "status must be 'active' or 'disabled'" }, { status: 400 });
  }
  if (params.id === g.admin.id) {
    return NextResponse.json({ error: "you cannot change your own status" }, { status: 400 });
  }
  try {
    const db = buildDb();
    await db.execute("UPDATE users SET status = $1 WHERE id = $2::uuid", status, params.id);
    return NextResponse.json({ ok: true, id: params.id, status });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }
}
