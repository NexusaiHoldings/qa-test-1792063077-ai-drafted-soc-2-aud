/**
 * GET /api/admin/data/tables — list the company's product (domain) tables with
 * row + column counts (admin-data-001). Admin-gated. Platform/lego tables are
 * excluded by listDomainTables so this only surfaces the company's own data.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { buildDb } from "@/lib/db";
import { listDomainTables } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  try {
    const tables = await listDomainTables(buildDb());
    return NextResponse.json({ tables });
  } catch (err) {
    return NextResponse.json(
      { tables: [], error: String(err).slice(0, 200) },
      { status: 200 },
    );
  }
}
