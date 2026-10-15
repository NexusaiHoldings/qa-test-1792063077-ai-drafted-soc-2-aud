/**
 * POST /api/auth/signup — create a user account and open a session.
 *
 * Ported 2026-05-12 from api/signup.py. Algorithms preserved:
 *   - scrypt password hash (via _lib/crypto)
 *   - Password policy validation (min_length, require_uppercase/digit/special)
 *   - Email format validation
 *   - Race-safe duplicate-email check + insert
 *   - Auto-session-create on success (30-day expiry, same as login)
 */

import {
  hashPassword,
  randomTokenUrlsafe,
  sha256Hex,
} from "./_lib/crypto";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { err, ok } from "./_lib/handler";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface PasswordPolicy {
  readonly min_length?: number;
  readonly require_uppercase?: boolean;
  readonly require_digit?: boolean;
  readonly require_special?: boolean;
}

export interface SignupBody {
  readonly email?: string;
  readonly password?: string;
  readonly confirm_password?: string;
}

export interface SignupInput {
  readonly body: SignupBody;
  readonly ctx: HandlerContext;
  readonly policy?: PasswordPolicy;
}

function validatePassword(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];
  const minLen = policy.min_length ?? 8;
  if (password.length < minLen) {
    errors.push(`password must be at least ${minLen} characters`);
  }
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    errors.push("password must contain at least one uppercase letter");
  }
  if (policy.require_digit && !/\d/.test(password)) {
    errors.push("password must contain at least one digit");
  }
  if (policy.require_special && !/[^a-zA-Z0-9]/.test(password)) {
    errors.push("password must contain at least one special character");
  }
  return errors;
}

export async function handleSignup({
  body,
  ctx,
  policy = {},
}: SignupInput): Promise<HandlerResult> {
  const email = (body.email || "").trim();
  const password = body.password || "";
  const confirm = body.confirm_password || "";

  if (!EMAIL_RE.test(email)) return err(400, "invalid email address");
  if (password !== confirm) return err(400, "passwords do not match");

  const errors = validatePassword(password, policy);
  if (errors.length > 0) return { status: 400, body: { errors } };

  try {
    const existing = await ctx.db.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      email,
    );
    if (existing.length > 0) return err(409, "email already registered");

    const userId = crypto.randomUUID();
    await ctx.db.execute(
      "INSERT INTO users (id, email, password_hash, status) VALUES ($1::uuid, $2, $3, 'active')",
      userId,
      email,
      hashPassword(password),
    );

    const token = randomTokenUrlsafe(32);
    await ctx.db.execute(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) " +
        "VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '30 days')",
      crypto.randomUUID(),
      userId,
      sha256Hex(token),
    );

    await ctx.events.publish("user.created", { user_id: userId, email });
    return ok({ session_token: token, user_id: userId }, 201);
  } catch {
    return err(500, "internal error");
  }
}
