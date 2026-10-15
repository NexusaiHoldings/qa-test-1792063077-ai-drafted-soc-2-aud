/**
 * GET /api/admin/data/[table]?limit=&offset= — browse rows of one product table
 * (admin-data-001). Admin-gated. The table name is validated against the live
 * catalog (getDomainTable → null for unknown/excluded names → 404), then the
 * confirmed identifier is double-quoted. Values are bound. Returns column
 * metadata (incl. which columns are editable + the primary key) + a page of rows.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { buildDb } from "@/lib/db";
import { getDomainTable, quoteIdent } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { table: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;

  const db = buildDb();
  let meta;
  try {
    meta = await getDomainTable(db, params.table);
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }
  if (!meta) return NextResponse.json({ error: "unknown table" }, { status: 404 });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const orderCol = meta.pk || meta.columns[0]?.name;
  const orderSql = orderCol ? ` ORDER BY ${quoteIdent(orderCol)}` : "";

  try {
    const rows = await db.query(
      `SELECT * FROM ${quoteIdent(meta.name)}${orderSql} LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );
    const totalRow = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${quoteIdent(meta.name)}`,
    );
    return NextResponse.json({
      table: meta.name,
      pk: meta.pk,
      columns: meta.columns,
      rows,
      total: Number(totalRow[0]?.n || 0),
      limit,
      offset,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }
}
