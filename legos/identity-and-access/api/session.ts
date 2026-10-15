/**
 * GET /api/auth/session — validate a session token and return user info.
 *
 * Ported 2026-05-12 from api/session.py. SHA256-hashes the bearer token
 * before DB lookup (matching Python implementation — defense-in-depth).
 */

import { sha256Hex } from "./_lib/crypto";
import { extractBearerToken, err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

export interface SessionInput {
  readonly authorizationHeader: string | null;
  readonly ctx: HandlerContext;
}

interface SessionRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly expires_at: string;
  readonly email: string;
  readonly status: string;
}

export async function handleSession({
  authorizationHeader,
  ctx,
}: SessionInput): Promise<HandlerResult> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return err(401, "missing or invalid Authorization header");
  }

  const tokenHash = sha256Hex(token);

  let rows: SessionRow[];
  try {
    rows = await ctx.db.query<SessionRow>(
      "SELECT s.id AS session_id, s.user_id, s.expires_at, u.email, u.status " +
        "FROM sessions s " +
        "JOIN users u ON u.id = s.user_id " +
        "WHERE s.token_hash = $1 " +
        "  AND s.expires_at > NOW() " +
        "  AND u.status = 'active' " +
        "LIMIT 1",
      tokenHash,
    );
  } catch {
    return err(500, "internal error");
  }

  if (rows.length === 0) {
    return err(401, "invalid or expired session");
  }

  const row = rows[0];
  return ok({
    user_id: row.user_id,
    email: row.email,
    session_id: row.session_id,
    expires_at: row.expires_at,
  });
}
