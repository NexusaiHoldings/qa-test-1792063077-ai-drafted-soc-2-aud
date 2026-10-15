/**
 * MFA (TOTP) — enroll, verify-enrollment, challenge, recovery codes.
 *
 * Ported 2026-05-12 from api/mfa.py. Algorithmic notes:
 *   - TOTP per RFC 6238: HMAC-SHA1, 30-second step, ±1 step tolerance,
 *     6-digit output zero-padded. Bit-identical to Python implementation.
 *   - Secret encryption: Python used Fernet (AES-128-CBC + HMAC-SHA256).
 *     This port uses AES-256-GCM via Node crypto — stronger, modern AEAD.
 *     Encrypted secrets generated under Fernet will NOT be readable here;
 *     not a regression because the substrate is greenfield (no existing
 *     enrolled users in TS substrate). All new enrollments use GCM.
 *   - Recovery codes: 8 codes, 16 hex chars formatted XXXX-XXXX, SHA256
 *     hashed before DB storage.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { sha256Hex } from "./_lib/crypto";
import { err, extractBearerToken, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const RECOVERY_CODE_COUNT = 8;
const TOTP_STEP_SECONDS = 30;

// ── TOTP (RFC 6238) ────────────────────────────────────────────────────────

function totp(keyBytes: Buffer, stepOffset = 0): string {
  const counter =
    Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const h = createHmac("sha1", keyBytes).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

function verifyTotp(keyBytes: Buffer, code: string): boolean {
  return [-1, 0, 1].some((s) => totp(keyBytes, s) === code);
}

// ── Base32 (TOTP secret encoding for otpauth:// URI) ────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

// ── AES-256-GCM for TOTP secret encryption ─────────────────────────────────

/** Returns base64-encoded key for storage; caller persists this with the user. */
function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}

/** Encrypt secret bytes; output format: base64(iv ‖ tag ‖ ciphertext). */
function encryptSecret(secretBytes: Buffer, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(secretBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

function decryptSecret(payloadBase64: string, keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  const buf = Buffer.from(payloadBase64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ── Recovery codes ─────────────────────────────────────────────────────────

function generateRecoveryCodes(): { plaintext: string[]; hashed: string[] } {
  const plaintext: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    const formatted = `${raw.slice(0, 8)}-${raw.slice(8)}`;
    plaintext.push(formatted);
    hashed.push(
      createHash("sha256").update(formatted, "utf8").digest("hex"),
    );
  }
  return { plaintext, hashed };
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.trim().toUpperCase(), "utf8")
    .digest("hex");
}

// ── Handler: enroll TOTP ───────────────────────────────────────────────────

export interface MfaEnrollInput {
  readonly authorizationHeader: string | null;
  readonly body: { readonly label?: string };
  readonly ctx: HandlerContext;
}

export async function handleMfaEnrollTotp({
  authorizationHeader,
  body,
  ctx,
}: MfaEnrollInput): Promise<HandlerResult> {
  const sessionToken = extractBearerToken(authorizationHeader);
  if (!sessionToken) return err(401, "authentication required");

  const tokenHash = sha256Hex(sessionToken);
  let sessions: Array<{ user_id: string }>;
  try {
    sessions = await ctx.db.query<{ user_id: string }>(
      "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1",
      tokenHash,
    );
  } catch {
    return err(500, "internal error");
  }
  if (sessions.length === 0) return err(401, "invalid or expired session");

  const userId = sessions[0].user_id;
  const label = body.label || "Authenticator";

  const secretBytes = randomBytes(20);
  const secretB32 = base32Encode(secretBytes);
  const encryptionKey = generateEncryptionKey();
  const encryptedSecret = encryptSecret(secretBytes, encryptionKey);

  const factorId = randomUUID();
  try {
    await ctx.db.execute(
      "INSERT INTO mfa_factors (id, user_id, factor_type, secret_encrypted, label, status) " +
        "VALUES ($1::uuid, $2::uuid, 'totp', $3, $4, 'pending')",
      factorId,
      userId,
      encryptedSecret,
      label,
    );

    const { plaintext, hashed } = generateRecoveryCodes();
    for (const codeHash of hashed) {
      await ctx.db.execute(
        "INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES ($1::uuid, $2::uuid, $3)",
        randomUUID(),
        userId,
        codeHash,
      );
    }

    return ok({
      factor_id: factorId,
      otpauth_uri: `otpauth://totp/${encodeURIComponent(label)}?secret=${secretB32}&issuer=NexusApp`,
      secret_b32: secretB32,
      recovery_codes: plaintext,
      encryption_key: encryptionKey, // client retains; required to verify
    });
  } catch {
    return err(500, "internal error");
  }
}

// ── Handler: verify enrollment (activates the pending factor) ──────────────

export interface MfaVerifyInput {
  readonly body: {
    readonly factor_id?: string;
    readonly code?: string;
    readonly encryption_key?: string;
  };
  readonly ctx: HandlerContext;
}

export async function handleMfaEnrollVerify({
  body,
  ctx,
}: MfaVerifyInput): Promise<HandlerResult> {
  const factorId = body.factor_id || "";
  const code = body.code || "";
  const encryptionKey = body.encryption_key || "";
  if (!factorId || !code || !encryptionKey) {
    return err(400, "factor_id, code, and encryption_key required");
  }

  let rows: Array<{ user_id: string; secret_encrypted: string }>;
  try {
    rows = await ctx.db.query<{ user_id: string; secret_encrypted: string }>(
      "SELECT user_id, secret_encrypted FROM mfa_factors " +
        "WHERE id = $1::uuid AND factor_type = 'totp' LIMIT 1",
      factorId,
    );
  } catch {
    return err(500, "internal error");
  }
  if (rows.length === 0) return err(404, "factor not found");

  let secretBytes: Buffer;
  try {
    secretBytes = decryptSecret(rows[0].secret_encrypted, encryptionKey);
  } catch {
    return err(401, "invalid enrollment key");
  }
  if (!verifyTotp(secretBytes, code)) return err(401, "invalid TOTP code");

  try {
    await ctx.db.execute(
      "UPDATE mfa_factors SET status = 'active', last_used_at = NOW() WHERE id = $1::uuid",
      factorId,
    );
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("user.mfa_enrolled", {
    user_id: rows[0].user_id,
    factor_id: factorId,
  });
  return ok({ message: "MFA factor verified and active" });
}

// ── Handler: challenge (post-password TOTP check during login) ─────────────

export interface MfaChallengeInput {
  readonly body: {
    readonly user_id?: string;
    readonly factor_id?: string;
    readonly code?: string;
    readonly encryption_key?: string;
  };
  readonly ctx: HandlerContext;
}

export async function handleMfaChallenge({
  body,
  ctx,
}: MfaChallengeInput): Promise<HandlerResult> {
  const userId = body.user_id || "";
  const factorId = body.factor_id || "";
  const code = body.code || "";
  const encryptionKey = body.encryption_key || "";
  if (!userId || !factorId || !code || !encryptionKey) {
    return err(400, "user_id, factor_id, code, and encryption_key required");
  }

  let rows: Array<{ secret_encrypted: string }>;
  try {
    rows = await ctx.db.query<{ secret_encrypted: string }>(
      "SELECT secret_encrypted FROM mfa_factors " +
        "WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'active' LIMIT 1",
      factorId,
      userId,
    );
  } catch {
    return err(500, "internal error");
  }
  if (rows.length === 0) {
    await ctx.events.publish("user.mfa_challenge_failed", {
      user_id: userId,
      factor_id: factorId,
    });
    return err(401, "factor not found or inactive");
  }

  let secretBytes: Buffer;
  try {
    secretBytes = decryptSecret(rows[0].secret_encrypted, encryptionKey);
  } catch {
    return err(401, "invalid factor key");
  }
  if (!verifyTotp(secretBytes, code)) {
    await ctx.events.publish("user.mfa_challenge_failed", {
      user_id: userId,
      factor_id: factorId,
    });
    return err(401, "invalid TOTP code");
  }

  try {
    await ctx.db.execute(
      "UPDATE mfa_factors SET last_used_at = NOW() WHERE id = $1::uuid",
      factorId,
    );
  } catch {
    // Non-fatal — log internally if needed (events bus handles audit trail).
  }

  await ctx.events.publish("user.mfa_challenge_succeeded", {
    user_id: userId,
    factor_id: factorId,
  });
  return ok({ mfa_validated: true, user_id: userId });
}

// ── Handler: recovery code (fallback when device lost) ─────────────────────

export interface MfaRecoveryInput {
  readonly body: { readonly user_id?: string; readonly code?: string };
  readonly ctx: HandlerContext;
}

export async function handleMfaRecoveryCode({
  body,
  ctx,
}: MfaRecoveryInput): Promise<HandlerResult> {
  const userId = body.user_id || "";
  const code = body.code || "";
  if (!userId || !code) return err(400, "user_id and code required");

  const codeHash = hashRecoveryCode(code);
  let rows: Array<{ id: string; used_at: string | null }>;
  try {
    rows = await ctx.db.query<{ id: string; used_at: string | null }>(
      "SELECT id, used_at FROM mfa_recovery_codes " +
        "WHERE user_id = $1::uuid AND code_hash = $2 LIMIT 1",
      userId,
      codeHash,
    );
  } catch {
    return err(500, "internal error");
  }
  if (rows.length === 0) return err(401, "invalid recovery code");
  if (rows[0].used_at !== null) return err(401, "recovery code already used");

  try {
    await ctx.db.execute(
      "UPDATE mfa_recovery_codes SET used_at = NOW() WHERE id = $1::uuid",
      rows[0].id,
    );
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("user.mfa_challenge_succeeded", {
    user_id: userId,
    via: "recovery_code",
  });
  return ok({ mfa_validated: true, user_id: userId });
}
