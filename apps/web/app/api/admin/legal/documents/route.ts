/**
 * /api/admin/legal/documents — admin Legal surface (admin-legal-001).
 *
 *   GET  — every version of every legal document (full history), admin-gated.
 *   POST — publish a new version (terms/privacy/cookie/accessibility).
 *
 * Admin-gated via requireAdmin(). The lego's handlePublishDocument checks a
 * static admin token; we pass tok() as both header + expected so it passes
 * server-side, and stamp published_by with the session admin's id.
 */
import { NextResponse } from "next/server";
import {
  handleListAllDocuments,
  handlePublishDocument,
} from "@nexus/legal-and-compliance";
import { requireAdmin, adminCtx, tok } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function send(result: { status: number; body: string | Record<string, unknown> }): Response {
  const init: ResponseInit = { status: result.status };
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}

export async function GET(request: Request): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  const url = new URL(request.url);
  const result = await handleListAllDocuments({
    query: {
      doc_type: url.searchParams.get("doc_type") || undefined,
      jurisdiction: url.searchParams.get("jurisdiction") || undefined,
    },
    ctx: adminCtx(),
  });
  return send(result);
}

export async function POST(request: Request): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body tolerated; handler validates required fields */
  }
  const result = await handlePublishDocument({
    adminTokenHeader: tok(),
    adminToken: tok(),
    body: { ...body, published_by: g.admin.id },
    ctx: adminCtx(),
  });
  return send(result);
}
