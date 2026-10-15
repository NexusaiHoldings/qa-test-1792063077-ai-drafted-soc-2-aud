/**
 * Proxy GET /api/runtime/threads/[threadId] → portfolio-runtime getThread
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRuntimeRequestOpts, getThread } from "@/lib/runtime";
import { RuntimeClientError } from "@nexus-substrate/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const opts = getRuntimeRequestOpts();
    const detail = await getThread(opts, params.threadId);
    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof RuntimeClientError) {
      return new NextResponse(err.body || `HTTP ${err.status}`, { status: err.status });
    }
    console.error("[api/runtime/threads/[id]] unexpected error:", err);
    return new NextResponse("internal proxy error", { status: 500 });
  }
}
