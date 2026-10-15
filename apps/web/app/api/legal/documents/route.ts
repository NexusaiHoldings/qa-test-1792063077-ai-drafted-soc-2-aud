/**
 * GET /api/legal/documents?doc_type=&jurisdiction= — substrate shim for
 * @nexus/legal-and-compliance (legal-surface-mount-001). Returns the
 * currently-effective legal document(s). Mirrors the api/auth/* shim pattern.
 */
import { NextResponse } from "next/server";
import { handleListDocuments } from "@nexus/legal-and-compliance";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const result = await handleListDocuments({
    query: {
      doc_type: url.searchParams.get("doc_type") || undefined,
      jurisdiction: url.searchParams.get("jurisdiction") || undefined,
    },
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
