/**
 * POST /api/auth/login — substrate shim for @nexus/identity-and-access.
 *
 * Sprint substrate-auth-routes-001 (2026-05-21).
 *
 * Pre-fix: this route didn't exist. Auth-protected features (e.g., Verifolio
 * F1-007 /reports) redirect to /api/auth/login on missing session → 404.
 * Post-fix: lego handler runs with a substrate-provided HandlerContext.
 *
 * Request body: { email: string, password: string }
 * Response: { session_token, expires_at, user: { id, email } } on 200,
 *           plain-text error on 4xx/5xx.
 */

import { NextResponse } from "next/server";
import { handleLogin } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pg + raw SQL — not edge-compatible

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const result = await handleLogin({
    body: {
      email: body.email ?? "",
      password: body.password ?? "",
    },
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const responseInit: ResponseInit = { status: result.status };
  if (result.headers) responseInit.headers = result.headers;

  const response =
    typeof result.body === "string"
      ? new NextResponse(result.body, responseInit)
      : NextResponse.json(result.body, responseInit);

  // The lego returns { session_token } in the JSON body but does not set a
  // cookie. Auth-gated pages read the `session_token` cookie via next/headers
  // cookies(), so we set it here (HttpOnly) on a successful login.
  if (
    result.status === 200 &&
    typeof result.body === "object" &&
    result.body !== null &&
    typeof (result.body as { session_token?: unknown }).session_token === "string"
  ) {
    response.cookies.set({
      name: "session_token",
      value: (result.body as { session_token: string }).session_token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return response;
}
