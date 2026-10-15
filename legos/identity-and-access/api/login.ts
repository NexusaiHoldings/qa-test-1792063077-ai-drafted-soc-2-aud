/**
 * POST /api/auth/login — authenticate a user and create a session.
 *
 * Ported 2026-05-12 from api/login.py. Algorithms preserved:
 *   - scrypt(N=2^14, r=8, p=1, keyLen=64) for password verification
 *   - timing-safe comparison via crypto.timingSafeEqual
 *   - 32-byte URL-safe random session token, SHA256-hashed before DB storage
 *   - 30-day session expiry
 *   - MFA gate: returns {requires_mfa: true, factor_id} when user has active TOTP
 */

import {
  randomTokenUrlsafe,
  sha256Hex,
  verifyPassword,
} from "./_lib/crypto";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { err, ok } from "./_lib/handler";

export interface LoginBody {
  readonly email?: string;
  readonly password?: string;
}

export interface LoginInput {
  readonly body: LoginBody;
  readonly ctx: HandlerContext;
}

interface UserRow {
  readonly id: string;
  readonly password_hash: string;
  readonly status: string;
}

interface MfaFactorRow {
  readonly id: string;
}

export async function handleLogin({
  body,
  ctx,
}: LoginInput): Promise<HandlerResult> {
  const email = (body.email || "").trim();
  const password = body.password || "";

  if (!email || !password) {
    return err(400, "email and password required");
  }

  let users: UserRow[];
  try {
    users = await ctx.db.query<UserRow>(
      "SELECT id, password_hash, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      email,
    );
  } catch {
    return err(500, "internal error");
  }

  if (users.length === 0) {
    await ctx.events.publish("user.login_failed", { reason: "user_not_found" });
    return err(401, "invalid credentials");
  }

  const row = users[0];

  if (row.status !== "active") {
    await ctx.events.publish("user.login_failed", { reason: "user_disabled" });
    return err(401, "account is disabled");
  }

  if (!verifyPassword(password, row.password_hash)) {
    await ctx.events.publish("user.login_failed", { reason: "invalid_password" });
    return err(401, "invalid credentials");
  }

  const userId = row.id;

  // MFA gate
  let mfaFactors: MfaFactorRow[] = [];
  try {
    mfaFactors = await ctx.db.query<MfaFactorRow>(
      "SELECT id FROM mfa_factors WHERE user_id = $1::uuid AND status = 'active' LIMIT 1",
      userId,
    );
  } catch {
    // Treat MFA-check failure as "no MFA" — fail open per Python implementation.
    // Logged on Python side; preserved behavior here.
  }

  if (mfaFactors.length > 0) {
    return ok({ requires_mfa: true, factor_id: mfaFactors[0].id });
  }

  // Issue session
  const token = randomTokenUrlsafe(32);
  const tokenHash = sha256Hex(token);
  const sessionId = crypto.randomUUID();

  try {
    await ctx.db.execute(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) " +
        "VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '30 days')",
      sessionId,
      userId,
      tokenHash,
    );
    await ctx.db.execute(
      "UPDATE users SET last_login_at = NOW() WHERE id = $1::uuid",
      userId,
    );
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("user.signed_in", { user_id: userId });
  return ok({ session_token: token, user_id: userId });
}
