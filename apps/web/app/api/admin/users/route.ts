/**
 * GET /api/admin/users — list users for the Users admin page (admin-users-001).
 *
 * Reads the company's own `users` table (the @nexus/identity-and-access schema:
 * id, email, status, created_at, last_login_at). Admin-gated via requireAdmin()
 * (session user must be in ADMIN_EMAILS). Never exposes password_hash.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { buildDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  try {
    const db = buildDb();
    const rows = await db.query(
      "SELECT id, email, status, created_at, last_login_at FROM users " +
        "ORDER BY created_at DESC LIMIT 500",
    );
    return NextResponse.json({ users: rows });
  } catch (err) {
    return NextResponse.json(
      { users: [], error: String(err).slice(0, 200) },
      { status: 200 },
    );
  }
}
