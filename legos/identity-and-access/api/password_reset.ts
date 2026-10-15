/**
 * POST /api/auth/password-reset/request — start reset (always 200 with safe reply)
 * POST /api/auth/password-reset/confirm — apply new password using emailed token
 *
 * Ported 2026-05-12 from api/password_reset.py. Preserved:
 *   - In-memory rate limit (3 requests / hour per email — v1, single-instance)
 *   - Safe reply (don't leak which emails are registered)
 *   - 1-hour token expiry
 *   - On confirm: rotate password, mark token used, expire all sessions
 *
 * Email enqueue is fire-and-forget via EventBus — the substrate's notifications
 * lego listener handles actual Resend send. Decoupled to avoid hard dependency
 * on email provider availability.
 */

import { hashPassword, randomTokenUrlsafe, sha256Hex } from "./_lib/crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 3600_000;

// In-memory rate limit store: email → array of request timestamps (ms).
// Single-instance — matches Python implementation. Multi-instance deployments
// should swap to a shared store (Redis, DB) in a future hardening sprint.
const rateLimitStore = new Map<string, number[]>();

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitStore.get(email) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(email, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitStore.set(email, timestamps);
  return true;
}

const SAFE_REPLY = {
  message: "if that email exists, a reset link has been sent",
};

export interface PasswordResetRequestInput {
  readonly body: { readonly email?: string };
  readonly ctx: HandlerContext;
}

export async function handlePasswordResetRequest({
  body,
  ctx,
}: PasswordResetRequestInput): Promise<HandlerResult> {
  const email = (body.email || "").trim().toLowerCase();
  if (!email) return err(400, "email required");

  if (!checkRateLimit(email)) {
    return err(429, "too many reset requests; try again later");
  }

  try {
    const rows = await ctx.db.query<{ id: string }>(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      email,
    );
    if (rows.length > 0) {
      const userId = rows[0].id;
      const token = randomTokenUrlsafe(32);
      await ctx.db.execute(
        "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) " +
          "VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '1 hour')",
        crypto.randomUUID(),
        userId,
        sha256Hex(token),
      );
      await ctx.events.publish("user.password_reset_requested", {
        user_id: userId,
        email,
        token, // notifications lego renders the reset URL from this
      });
    }
  } catch {
    // Swallow errors — return safe reply regardless. Don't leak DB state.
  }

  return ok(SAFE_REPLY);
}

export interface PasswordResetConfirmInput {
  readonly body: { readonly token?: string; readonly new_password?: string };
  readonly ctx: HandlerContext;
}

export async function handlePasswordResetConfirm({
  body,
  ctx,
}: PasswordResetConfirmInput): Promise<HandlerResult> {
  const token = body.token || "";
  const newPassword = body.new_password || "";
  if (!token || !newPassword) return err(400, "token and new_password required");

  let rows: Array<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>;
  try {
    rows = await ctx.db.query(
      "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens " +
        "WHERE token_hash = $1 LIMIT 1",
      sha256Hex(token),
    );
  } catch {
    return err(500, "internal error");
  }

  if (rows.length === 0) return err(401, "invalid or expired reset token");

  const row = rows[0];
  if (row.used_at !== null) return err(401, "reset token already used");
  if (new Date(row.expires_at) < new Date()) {
    return err(401, "reset token expired");
  }

  try {
    await ctx.db.execute(
      "UPDATE users SET password_hash = $1 WHERE id = $2::uuid",
      hashPassword(newPassword),
      row.user_id,
    );
    await ctx.db.execute(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1::uuid",
      row.id,
    );
    await ctx.db.execute(
      "UPDATE sessions SET expires_at = NOW() WHERE user_id = $1::uuid",
      row.user_id,
    );
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("user.password_reset_completed", {
    user_id: row.user_id,
  });
  return ok({ message: "password updated" });
}
