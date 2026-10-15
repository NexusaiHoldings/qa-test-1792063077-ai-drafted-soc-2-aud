/**
 * Proxy GET /api/runtime/threads → portfolio-runtime listThreads
 * Proxy POST /api/runtime/threads → portfolio-runtime createThread
 *
 * The browser calls these relative routes; this Next.js route attaches
 * the Bearer token server-side before forwarding. Token stays out of
 * the browser bundle (ADR 0025 + sprint contract hard-stop #6).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getRuntimeRequestOpts,
  listThreads,
  createThread,
} from "@/lib/runtime";
import { RuntimeClientError } from "@nexus-substrate/runtime-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function _errorResponse(err: unknown): NextResponse {
  if (err instanceof RuntimeClientError) {
    return new NextResponse(err.body || `HTTP ${err.status}`, { status: err.status });
  }
  console.error("[api/runtime/threads] unexpected error:", err);
  return new NextResponse("internal proxy error", { status: 500 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const opts = getRuntimeRequestOpts();
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const threads = await listThreads(opts, limit);
    return NextResponse.json(threads);
  } catch (err) {
    return _errorResponse(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const opts = getRuntimeRequestOpts();
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const thread = await createThread(opts, body);
    return NextResponse.json(thread, { status: 201 });
  } catch (err) {
    return _errorResponse(err);
  }
}
