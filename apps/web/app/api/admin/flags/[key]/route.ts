/** /api/admin/flags/[key] — GET one, PATCH update, DELETE. */
import {
  handleGetFlag,
  handleUpdateFlag,
  handleDeleteFlag,
} from "@nexus/admin-console";
import { requireAdmin, adminCtx, tok, translate } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { key: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const result = await handleGetFlag({
    adminTokenHeader: tok(),
    adminToken: tok(),
    ctx: adminCtx(),
    key: params.key,
  });
  return translate(result);
}

export async function PATCH(
  request: Request,
  { params }: { params: { key: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body tolerated */
  }
  const result = await handleUpdateFlag({
    adminTokenHeader: tok(),
    adminToken: tok(),
    adminUserId: g.admin.id,
    ctx: adminCtx(),
    key: params.key,
    body,
  });
  return translate(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { key: string } },
): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const result = await handleDeleteFlag({
    adminTokenHeader: tok(),
    adminToken: tok(),
    adminUserId: g.admin.id,
    ctx: adminCtx(),
    key: params.key,
  });
  return translate(result);
}
