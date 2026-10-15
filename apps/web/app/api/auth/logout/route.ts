/**
 * POST /api/auth/logout — substrate shim for @nexus/identity-and-access.
 *
 * Sprint substrate-auth-routes-001 (2026-05-21).
 *
 * Headers: Authorization: Bearer <session_token>
 * Response: 204 on success.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleLogout } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  // The session lives in an HttpOnly cookie, so client logout POSTs carry no
  // Authorization header — read the token from the cookie to revoke it.
  const cookieToken = cookies().get("session_token")?.value;
  const authHeader =
    request.headers.get("authorization") ||
    (cookieToken ? `Bearer ${cookieToken}` : null);

  const result = await handleLogout({
    authorizationHeader: authHeader,
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const responseInit: ResponseInit = { status: result.status };
  if (result.headers) responseInit.headers = result.headers;

  // 204 No Content must have a null body — `new NextResponse("", {status:204})`
  // throws (which surfaced as a bare 500 with no Set-Cookie).
  const response =
    result.status === 204 || result.status === 304
      ? new NextResponse(null, responseInit)
      : typeof result.body === "string"
        ? new NextResponse(result.body, responseInit)
        : NextResponse.json(result.body, responseInit);

  // Always clear the session cookie (idempotent logout, even if no token).
  response.cookies.set({
    name: "session_token",
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
