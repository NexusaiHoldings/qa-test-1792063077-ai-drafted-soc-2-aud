/**
 * POST /api/auth/signup — substrate shim for @nexus/identity-and-access.
 *
 * Sprint substrate-auth-routes-001 (2026-05-21).
 *
 * Request body: { email: string, password: string, ... }
 * Response: 201 with { user, session_token } on success.
 */

import { NextResponse } from "next/server";
import { handleSignup } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await handleSignup({
    body: body as Parameters<typeof handleSignup>[0]["body"],
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const responseInit: ResponseInit = { status: result.status };
  if (result.headers) responseInit.headers = result.headers;

  const response =
    typeof result.body === "string"
      ? new NextResponse(result.body, responseInit)
      : NextResponse.json(result.body, responseInit);

  // Signup returns { session_token } (201) and auto-logs-in the new user.
  // Set the HttpOnly cookie the auth-gated pages read, same as /login.
  if (
    result.status === 201 &&
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
