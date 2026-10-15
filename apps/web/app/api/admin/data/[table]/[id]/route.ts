/**
 * PATCH/DELETE /api/admin/data/[table]/[id] — edit or delete one row of a product
 * table (admin-data-001). Admin-gated.
 *
 * SECURITY: the table is validated against the live catalog; only columns that
 * exist AND are flagged editable (PK never editable; only text-coercible scalar
 * types) are updated; identifiers are catalog-confirmed then quoted; the row id
 * and all values are bound parameters. Requires a single-column primary key —
 * tables without one are read-only here (can't safely address a row).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { buildDb } from "@/lib/db";
import { getDomainTable, quoteIdent, type ColumnMeta } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEXT_UDT = new Set(["text", "varchar", "bpchar", "name", "citext"]);

/** Empty string on a non-text column means "clear" → null. */
function coerce(value: unknown, col: ColumnMeta): unknown {
  if (value === "" && !TEXT_UDT.has(col.udt_name)) return null;
  return value;
}

export async function PATCH(
  request: Request,
  { params }: { params: { table: string; id: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;

  const db = buildDb();
  const meta = await getDomainTable(db, params.table).catch(() => null);
  if (!meta) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  if (!meta.pk) {
    return NextResponse.json(
      { error: "table has no single-column primary key; not editable here" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const byName = new Map(meta.columns.map((c) => [c.name, c]));
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, raw] of Object.entries(body)) {
    const col = byName.get(key);
    if (!col || !col.editable) continue; // silently skip unknown / non-editable
    values.push(coerce(raw, col));
    sets.push(`${quoteIdent(col.name)} = $${values.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "no editable columns supplied" }, { status: 400 });
  }

  values.push(params.id);
  const idIdx = values.length;
  try {
    await db.execute(
      `UPDATE ${quoteIdent(meta.name)} SET ${sets.join(", ")} ` +
        `WHERE ${quoteIdent(meta.pk)} = $${idIdx}`,
      ...values,
    );
    return NextResponse.json({ ok: true, id: params.id, updated: sets.length });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { table: string; id: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;

  const db = buildDb();
  const meta = await getDomainTable(db, params.table).catch(() => null);
  if (!meta) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  if (!meta.pk) {
    return NextResponse.json(
      { error: "table has no single-column primary key; not deletable here" },
      { status: 400 },
    );
  }
  try {
    await db.execute(
      `DELETE FROM ${quoteIdent(meta.name)} WHERE ${quoteIdent(meta.pk)} = $1`,
      params.id,
    );
    return NextResponse.json({ ok: true, id: params.id });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }
}
