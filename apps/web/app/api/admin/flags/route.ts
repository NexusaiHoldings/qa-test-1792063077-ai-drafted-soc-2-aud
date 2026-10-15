/** /api/admin/flags — GET list, POST create. */
import { handleListFlags, handleCreateFlag } from "@nexus/admin-console";
import { requireAdmin, adminCtx, tok, translate } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const result = await handleListFlags({
    adminTokenHeader: tok(),
    adminToken: tok(),
    ctx: adminCtx(),
  });
  return translate(result);
}

export async function POST(request: Request): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body tolerated */
  }
  const result = await handleCreateFlag({
    adminTokenHeader: tok(),
    adminToken: tok(),
    adminUserId: g.admin.id,
    ctx: adminCtx(),
    body,
  });
  return translate(result);
}
