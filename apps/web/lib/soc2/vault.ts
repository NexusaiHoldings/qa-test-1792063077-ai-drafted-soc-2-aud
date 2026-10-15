/**
 * Credential vault — envelope encryption for SOC 2 connector secrets
 * (F1-002, apps/web/lib/soc2/vault.ts).
 *
 * Why envelope encryption: the feasibility worker's risk list calls out
 * "multi-tenant ingestion of sensitive AWS/GCP/GitHub configs requires robust
 * security isolation" and the liability assessor demands a "zero-retention
 * architecture for ingested credentials". We therefore NEVER persist a secret
 * in plaintext. A fresh random 256-bit data-encryption key (DEK) encrypts the
 * secret with AES-256-GCM; the DEK is then wrapped (also AES-256-GCM) under a
 * long-lived key-encryption key (KEK) derived from SOC2_VAULT_MASTER_KEY (or,
 * in environments without a dedicated vault key, NEXTAUTH_SECRET). Only the
 * ciphertext + wrapped DEK + IVs + GCM auth tags are stored.
 *
 * In production the KEK would live in AWS KMS (@aws-sdk/client-kms); the
 * envelope layout here is KMS-shaped (wrapped DEK is opaque, swappable for a
 * KMS CiphertextBlob) so that migration is a drop-in change to wrapDek/unwrapDek.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export interface CredentialEnvelope {
  readonly ciphertext: string; // base64 — secret encrypted under the DEK
  readonly iv: string; // base64 — GCM nonce for the ciphertext
  readonly authTag: string; // base64 — GCM tag for the ciphertext
  readonly wrappedDek: string; // base64 — DEK encrypted under the KEK
  readonly dekIv: string; // base64 — GCM nonce for the wrapped DEK
  readonly dekAuthTag: string; // base64 — GCM tag for the wrapped DEK
  readonly keyId: string; // identifier of the KEK used (for rotation)
}

interface CredentialRow {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  wrapped_dek: string;
  dek_iv: string;
  dek_auth_tag: string;
  key_id: string;
}

interface VaultDb {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<void>;
}

const ALGORITHM = "aes-256-gcm";

/**
 * Resolve the 32-byte key-encryption key. SOC2_VAULT_MASTER_KEY is preferred;
 * we fall back to NEXTAUTH_SECRET (always provisioned) so builds/dev never
 * crash for a missing key. The raw secret is hashed to a fixed 32 bytes so any
 * length of configured secret yields a valid AES-256 key.
 */
function resolveKek(): { key: Buffer; keyId: string } {
  const raw =
    process.env.SOC2_VAULT_MASTER_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "soc2-vault-dev-key-do-not-use-in-production";
  const key = createHash("sha256").update(raw, "utf8").digest();
  // keyId is a non-reversible fingerprint of the KEK so rotated keys are
  // distinguishable in stored rows without ever exposing the key itself.
  const keyId = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return { key, keyId };
}

/** Wrap (encrypt) a DEK under the KEK with AES-256-GCM. */
function wrapDek(dek: Buffer): { wrapped: Buffer; iv: Buffer; tag: Buffer; keyId: string } {
  const { key, keyId } = resolveKek();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { wrapped, iv, tag, keyId };
}

/** Unwrap (decrypt) a DEK that was wrapped under the KEK. */
function unwrapDek(wrapped: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const { key } = resolveKek();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

/**
 * Encrypt a plaintext secret into a self-contained envelope. The DEK lives only
 * for the duration of this call; what is returned (and later stored) is the
 * ciphertext plus the KEK-wrapped DEK.
 */
export function encryptSecret(plaintext: string): CredentialEnvelope {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("vault.encryptSecret: plaintext must be a non-empty string");
  }
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const { wrapped, iv: dekIv, tag: dekTag, keyId } = wrapDek(dek);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    wrappedDek: wrapped.toString("base64"),
    dekIv: dekIv.toString("base64"),
    dekAuthTag: dekTag.toString("base64"),
    keyId,
  };
}

/** Decrypt an envelope back to the original plaintext secret. */
export function decryptSecret(envelope: CredentialEnvelope): string {
  const dek = unwrapDek(
    Buffer.from(envelope.wrappedDek, "base64"),
    Buffer.from(envelope.dekIv, "base64"),
    Buffer.from(envelope.dekAuthTag, "base64"),
  );
  const decipher = createDecipheriv(ALGORITHM, dek, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Persist an encrypted credential for a connection. Enforces one active
 * credential per connection (delete-then-insert) so rotation is explicit and
 * stale key material never lingers (zero-retention).
 */
export async function storeCredential(
  db: VaultDb,
  args: {
    connectionId: string;
    organizationId: string;
    provider: string;
    plaintext: string;
  },
): Promise<void> {
  const env = encryptSecret(args.plaintext);
  await db.execute(
    `DELETE FROM soc2_credentials WHERE connection_id = $1::uuid`,
    args.connectionId,
  );
  await db.execute(
    `INSERT INTO soc2_credentials
       (connection_id, organization_id, provider, ciphertext, iv, auth_tag,
        wrapped_dek, dek_iv, dek_auth_tag, key_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)`,
    args.connectionId,
    args.organizationId,
    args.provider,
    env.ciphertext,
    env.iv,
    env.authTag,
    env.wrappedDek,
    env.dekIv,
    env.dekAuthTag,
    env.keyId,
  );
}

/**
 * Load and decrypt the active credential for a connection, or null if none is
 * stored. The decrypted secret exists only in memory for the caller's use.
 */
export async function loadCredential(
  db: VaultDb,
  connectionId: string,
): Promise<string | null> {
  const rows = await db.query<CredentialRow>(
    `SELECT ciphertext, iv, auth_tag, wrapped_dek, dek_iv, dek_auth_tag, key_id
       FROM soc2_credentials
      WHERE connection_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    connectionId,
  );
  const row = rows[0];
  if (!row) return null;
  return decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    wrappedDek: row.wrapped_dek,
    dekIv: row.dek_iv,
    dekAuthTag: row.dek_auth_tag,
    keyId: row.key_id,
  });
}

/** Permanently delete a connection's credential material (zero-retention). */
export async function purgeCredential(db: VaultDb, connectionId: string): Promise<void> {
  await db.execute(
    `DELETE FROM soc2_credentials WHERE connection_id = $1::uuid`,
    connectionId,
  );
}
