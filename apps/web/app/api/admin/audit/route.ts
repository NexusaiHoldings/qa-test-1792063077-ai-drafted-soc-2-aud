/** GET /api/admin/audit — list admin audit-log entries (filterable via query). */
import { handleListAudit } from "@nexus/admin-console";
import { requireAdmin, adminCtx, tok, translate } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUERY_KEYS = [
  "admin_user_id",
  "target_type",
  "target_id",
  "action",
  "from_ts",
  "to_ts",
  "limit",
  "offset",
] as const;

export async function GET(request: Request): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;

  const sp = new URL(request.url).searchParams;
  const query: Record<string, string> = {};
  for (const k of QUERY_KEYS) {
    const v = sp.get(k);
    if (v !== null) query[k] = v;
  }

  const result = await handleListAudit({
    adminTokenHeader: tok(),
    adminToken: tok(),
    ctx: adminCtx(),
    query,
  });
  return translate(result);
}
