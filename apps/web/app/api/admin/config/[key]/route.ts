/** /api/admin/config/[key] — GET one, PUT upsert. */
import { handleGetConfig, handlePutConfig } from "@nexus/admin-console";
import { requireAdmin, adminCtx, tok, translate } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { key: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const result = await handleGetConfig({
    adminTokenHeader: tok(),
    adminToken: tok(),
    ctx: adminCtx(),
    key: params.key,
  });
  return translate(result);
}

export async function PUT(
  request: Request,
  { params }: { params: { key: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  let body: { value?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body tolerated */
  }
  const result = await handlePutConfig({
    adminTokenHeader: tok(),
    adminToken: tok(),
    adminUserId: g.admin.id,
    ctx: adminCtx(),
    key: params.key,
    body,
  });
  return translate(result);
}
