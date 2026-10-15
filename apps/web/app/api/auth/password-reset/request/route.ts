/**
 * POST /api/auth/password-reset/request — start a password reset.
 *
 * Always returns a safe 200 ("if that email exists, a reset link has been
 * sent") regardless of whether the email is registered. On a real account the
 * lego stores a 1-hour token and publishes user.password_reset_requested,
 * which buildEventBus() turns into a Resend email (see lib/events.ts).
 */

import { NextResponse } from "next/server";
import { handlePasswordResetRequest } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await handlePasswordResetRequest({
    body: { email: body.email ?? "" },
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  if (typeof result.body === "string") {
    return new NextResponse(result.body, init);
  }
  return NextResponse.json(result.body, init);
}
