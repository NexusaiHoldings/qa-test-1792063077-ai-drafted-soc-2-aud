/**
 * POST /api/auth/password-reset/confirm — apply a new password using a token.
 *
 * Body: { token, new_password }. 200 on success; 400 missing fields;
 * 401 invalid/expired/used token. On success the lego rotates the password
 * and expires all of that user's sessions.
 */

import { NextResponse } from "next/server";
import { handlePasswordResetConfirm } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { token?: string; new_password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await handlePasswordResetConfirm({
    body: { token: body.token ?? "", new_password: body.new_password ?? "" },
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  if (typeof result.body === "string") {
    return new NextResponse(result.body, init);
  }
  return NextResponse.json(result.body, init);
}
