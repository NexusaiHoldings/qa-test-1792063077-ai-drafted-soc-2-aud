/**
 * Crypto primitives — port of Python scrypt + hmac.compare_digest pattern.
 *
 * Security review 2026-05-10 (originally on Python implementation): timing-safe
 * comparison via hmac.compare_digest eliminated a chosen-plaintext timing side-
 * channel. Node's equivalent is `crypto.timingSafeEqual(buf1, buf2)`. scrypt
 * params (N=2^14, r=8, p=1) preserved from Python — same crypto strength.
 *
 * Public surface:
 *   - hashPassword(plain): returns "saltHex:dkHex" matching Python storage format
 *   - verifyPassword(plain, stored): timing-safe comparison
 *   - sha256Hex(input): for session token hashing
 *   - randomTokenUrlsafe(bytes): equivalent to Python secrets.token_urlsafe()
 */

import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2; // node default is too small for N=16384

/**
 * Generate a fresh scrypt hash for a plaintext password.
 * Storage format: "saltHex:derivedKeyHex" (matches Python implementation).
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `${salt.toString("hex")}:${dk.toString("hex")}`;
}

/**
 * Timing-safe verification of a plaintext password against the stored hash.
 * Returns false on any error (malformed stored value, wrong length, etc.).
 */
export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [saltHex, dkHex] = stored.split(":", 2);
    if (!saltHex || !dkHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expectedDk = Buffer.from(dkHex, "hex");
    if (expectedDk.length !== SCRYPT_KEYLEN) return false;
    const candidateDk = scryptSync(plain, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    });
    return timingSafeEqual(candidateDk, expectedDk);
  } catch {
    return false;
  }
}

/**
 * SHA256 hex digest. Used for hashing session tokens before DB storage so the
 * raw token never lands in the database (defense in depth — a DB read leak
 * doesn't compromise active sessions).
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * URL-safe base64 random token. 32 bytes → 43 chars. Matches Python
 * secrets.token_urlsafe(32) output character set.
 */
export function randomTokenUrlsafe(numBytes = 32): string {
  return randomBytes(numBytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
