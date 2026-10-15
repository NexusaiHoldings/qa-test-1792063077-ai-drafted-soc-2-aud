/** Developer-surface handlers — developer-surface lego. Framework-agnostic. */
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** GET /api/dev/keys?user_id= — list a user's API keys (no secret material). */
export async function handleListKeys(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, name, prefix, status, last_used_at, created_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    userId,
  );
  return ok({ keys: rows, count: rows.length });
}

/** POST /api/dev/keys — create an API key (caller hashes; we store prefix+hash). */
export async function handleCreateKey(
  ctx: HandlerContext,
  body: { user_id?: string; name?: string; key_hash?: string; prefix?: string },
): Promise<HandlerResult> {
  if (!body.name || !body.key_hash || !body.prefix) {
    return err(400, "name, key_hash, prefix required");
  }
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO api_keys (user_id, name, key_hash, prefix)
     VALUES ($1, $2, $3, $4) RETURNING id, prefix, status`,
    body.user_id ?? null, body.name, body.key_hash, body.prefix,
  );
  await ctx.events.publish("api.key_created", { api_key_id: rows[0].id });
  return ok({ api_key_id: rows[0].id, prefix: rows[0].prefix }, 201);
}

/**
 * POST /api/dev/keys/{id}/revoke — revoke a key.
 * Server-side mutation behind the revoke_api_key agent tool (confirm).
 */
export async function handleRevokeKey(
  ctx: HandlerContext,
  keyId: string,
  body: { reason?: string },
): Promise<HandlerResult> {
  if (!keyId) return err(400, "key id is required");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE api_keys SET status = 'revoked' WHERE id = $1 AND status = 'active'
     RETURNING id, status`,
    keyId,
  );
  if (rows.length === 0) return err(404, "key not found or already revoked");
  await ctx.events.publish("api.key_revoked", { api_key_id: keyId, reason: body.reason ?? null });
  return ok({ api_key_id: keyId, status: "revoked" });
}

/** GET /api/dev/webhooks?user_id= — list webhooks. */
export async function handleListWebhooks(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, url, events, status, created_at FROM webhooks
     WHERE user_id = $1 ORDER BY created_at DESC`,
    userId,
  );
  return ok({ webhooks: rows, count: rows.length });
}
