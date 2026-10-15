/**
 * POST /api/auth/logout — invalidate the current session.
 *
 * Ported 2026-05-12 from api/logout.py. Idempotent: expired or unknown
 * tokens still return 204 (don't leak session-existence info to attackers).
 */

import { sha256Hex } from "./_lib/crypto";
import { extractBearerToken, err } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

export interface LogoutInput {
  readonly authorizationHeader: string | null;
  readonly ctx: HandlerContext;
}

export async function handleLogout({
  authorizationHeader,
  ctx,
}: LogoutInput): Promise<HandlerResult> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return err(401, "missing or invalid Authorization header");
  }

  const tokenHash = sha256Hex(token);

  try {
    const rows = await ctx.db.query<{ user_id: string }>(
      "UPDATE sessions SET expires_at = NOW() " +
        "WHERE token_hash = $1 AND expires_at > NOW() " +
        "RETURNING user_id",
      tokenHash,
    );
    if (rows.length > 0) {
      await ctx.events.publish("user.signed_out", { user_id: rows[0].user_id });
    }
  } catch {
    return err(500, "internal error");
  }

  return { status: 204, body: "" };
}
