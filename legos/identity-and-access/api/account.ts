/**
 * Account management — sessions, login history, deletion lifecycle.
 *
 * Ported 2026-05-12 from api/account.py.
 *   POST /api/auth/account/delete                   — 30-day grace soft-delete
 *   POST /api/auth/account/cancel-deletion          — undo within grace
 *   GET  /api/auth/account/sessions                 — list active sessions
 *   POST /api/auth/account/sessions/{id}/revoke     — revoke a single session
 *   GET  /api/auth/account/login-history            — last 50 entries
 *
 * All endpoints require a valid Bearer session token.
 */

import { sha256Hex } from "./_lib/crypto";
import { err, extractBearerToken, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

async function resolveUserId(
  authorizationHeader: string | null,
  ctx: HandlerContext,
): Promise<{ userId: string } | { error: HandlerResult }> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { error: err(401, "missing Authorization header") };
  }
  const tokenHash = sha256Hex(token);
  try {
    const rows = await ctx.db.query<{ user_id: string }>(
      "SELECT s.user_id FROM sessions s " +
        "JOIN users u ON u.id = s.user_id " +
        "WHERE s.token_hash=$1 AND s.expires_at > NOW() AND u.status='active' LIMIT 1",
      tokenHash,
    );
    if (rows.length === 0) {
      return { error: err(401, "invalid or expired session") };
    }
    return { userId: rows[0].user_id };
  } catch {
    return { error: err(500, "internal error") };
  }
}

export interface AccountInput {
  readonly authorizationHeader: string | null;
  readonly ctx: HandlerContext;
}

export async function handleDeleteAccount({
  authorizationHeader,
  ctx,
}: AccountInput): Promise<HandlerResult> {
  const resolved = await resolveUserId(authorizationHeader, ctx);
  if ("error" in resolved) return resolved.error;

  try {
    await ctx.db.execute(
      "UPDATE users SET deletion_requested_at=NOW(), " +
        "deletion_grace_until=NOW() + INTERVAL '30 days' WHERE id=$1::uuid",
      resolved.userId,
    );
  } catch {
    return err(500, "internal error");
  }
  await ctx.events.publish("user.deletion_requested", {
    user_id: resolved.userId,
  });
  return ok({ status: "deletion_scheduled", grace_days: 30 });
}

export async function handleCancelDeletion({
  authorizationHeader,
  ctx,
}: AccountInput): Promise<HandlerResult> {
  const resolved = await resolveUserId(authorizationHeader, ctx);
  if ("error" in resolved) return resolved.error;

  try {
    const rows = await ctx.db.query<{
      deletion_grace_until: string | null;
      status: string;
    }>(
      "SELECT deletion_grace_until, status FROM users WHERE id=$1::uuid LIMIT 1",
      resolved.userId,
    );
    if (rows.length === 0) return err(404, "user not found");
    if (rows[0].status === "deleted") return err(410, "account already deleted");
    if (rows[0].deletion_grace_until === null) {
      return err(400, "no deletion in progress");
    }
    await ctx.db.execute(
      "UPDATE users SET deletion_requested_at=NULL, deletion_grace_until=NULL WHERE id=$1::uuid",
      resolved.userId,
    );
  } catch {
    return err(500, "internal error");
  }
  return ok({ status: "deletion_cancelled" });
}

export async function handleListSessions({
  authorizationHeader,
  ctx,
}: AccountInput): Promise<HandlerResult> {
  const resolved = await resolveUserId(authorizationHeader, ctx);
  if ("error" in resolved) return resolved.error;

  try {
    const rows = await ctx.db.query<{
      id: string;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
      last_used_at: string | null;
    }>(
      "SELECT id, ip_address, user_agent, created_at, last_used_at " +
        "FROM sessions WHERE user_id=$1::uuid AND expires_at > NOW() ORDER BY created_at DESC",
      resolved.userId,
    );
    return ok({
      sessions: rows.map((r) => ({
        id: r.id,
        ip_address: r.ip_address || "",
        user_agent: r.user_agent || "",
        created_at: r.created_at,
        last_used_at: r.last_used_at || "",
      })),
    });
  } catch {
    return err(500, "internal error");
  }
}

export interface RevokeSessionInput extends AccountInput {
  readonly sessionId: string;
}

export async function handleRevokeSession({
  authorizationHeader,
  sessionId,
  ctx,
}: RevokeSessionInput): Promise<HandlerResult> {
  const resolved = await resolveUserId(authorizationHeader, ctx);
  if ("error" in resolved) return resolved.error;

  try {
    // Use RETURNING to detect whether the row existed.
    const rows = await ctx.db.query<{ id: string }>(
      "UPDATE sessions SET expires_at=NOW() WHERE id=$1::uuid AND user_id=$2::uuid RETURNING id",
      sessionId,
      resolved.userId,
    );
    if (rows.length === 0) return err(404, "session not found");
  } catch {
    return err(500, "internal error");
  }
  await ctx.events.publish("user.session_revoked", {
    user_id: resolved.userId,
    session_id: sessionId,
  });
  return ok({ status: "revoked" });
}

export async function handleLoginHistory({
  authorizationHeader,
  ctx,
}: AccountInput): Promise<HandlerResult> {
  const resolved = await resolveUserId(authorizationHeader, ctx);
  if ("error" in resolved) return resolved.error;

  try {
    const rows = await ctx.db.query<{
      id: string;
      login_at: string;
      ip_address: string | null;
      user_agent: string | null;
      method: string | null;
      success: boolean;
      failure_reason: string | null;
    }>(
      "SELECT id, login_at, ip_address, user_agent, method, success, failure_reason " +
        "FROM login_history WHERE user_id=$1::uuid ORDER BY login_at DESC LIMIT 50",
      resolved.userId,
    );
    return ok({
      history: rows.map((r) => ({
        id: r.id,
        login_at: r.login_at,
        ip_address: r.ip_address || "",
        user_agent: r.user_agent || "",
        method: r.method || "",
        success: r.success,
        failure_reason: r.failure_reason || "",
      })),
    });
  } catch {
    return err(500, "internal error");
  }
}
