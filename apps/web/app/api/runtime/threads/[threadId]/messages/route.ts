/**
 * Proxy GET /api/runtime/threads/[threadId]/messages → listMessages
 * Proxy POST /api/runtime/threads/[threadId]/messages → sendMessage
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getRuntimeRequestOpts,
  listMessages,
  sendMessage,
} from "@/lib/runtime";
import { RuntimeClientError } from "@nexus-substrate/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function _err(err: unknown): NextResponse {
  if (err instanceof RuntimeClientError) {
    return new NextResponse(err.body || `HTTP ${err.status}`, { status: err.status });
  }
  console.error("[api/runtime/threads/[id]/messages] unexpected error:", err);
  return new NextResponse("internal proxy error", { status: 500 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const opts = getRuntimeRequestOpts();
    const sp = req.nextUrl.searchParams;
    const limitRaw = sp.get("limit");
    const before = sp.get("before") ?? undefined;
    const msgs = await listMessages(opts, params.threadId, {
      limit: limitRaw ? Number(limitRaw) : undefined,
      before,
    });
    return NextResponse.json(msgs);
  } catch (err) {
    return _err(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const opts = getRuntimeRequestOpts();
    const body = (await req.json().catch(() => null)) as {
      content?: string;
      attachments?: unknown[];
    } | null;
    if (!body || typeof body.content !== "string" || !body.content.trim()) {
      return new NextResponse("content must be a non-empty string", { status: 400 });
    }
    const msg = await sendMessage(opts, params.threadId, {
      content: body.content,
      attachments: Array.isArray(body.attachments)
        ? (body.attachments as ReadonlyArray<Record<string, unknown>>)
        : undefined,
    });
    return NextResponse.json(msg, { status: 201 });
  } catch (err) {
    return _err(err);
  }
}
