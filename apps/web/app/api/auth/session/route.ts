/**
 * GET /api/auth/session — substrate shim for @nexus/identity-and-access.
 *
 * Sprint substrate-auth-routes-001 (2026-05-21).
 *
 * Headers: Authorization: Bearer <session_token>
 * Response: { user_id, email, session_id, expires_at } on 200,
 *           401 on missing/expired/invalid.
 *
 * This is the load-bearing endpoint that auth-protected server components
 * call to verify session validity. Pre-fix evidence: Verifolio F1-007's
 * getSession() helper hit this route → 404 → page rendered with no
 * session → redirect to /api/auth/login → 404 cascade.
 */

import { NextResponse } from "next/server";
import { handleSession } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const result = await handleSession({
    authorizationHeader: request.headers.get("authorization"),
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const responseInit: ResponseInit = { status: result.status };
  if (result.headers) responseInit.headers = result.headers;

  if (typeof result.body === "string") {
    return new NextResponse(result.body, responseInit);
  }
  return NextResponse.json(result.body, responseInit);
}
