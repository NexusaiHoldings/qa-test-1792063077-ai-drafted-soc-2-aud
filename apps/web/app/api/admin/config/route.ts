/** GET /api/admin/config — list system config entries. */
import { handleListConfig } from "@nexus/admin-console";
import { requireAdmin, adminCtx, tok, translate } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const result = await handleListConfig({
    adminTokenHeader: tok(),
    adminToken: tok(),
    ctx: adminCtx(),
  });
  return translate(result);
}
