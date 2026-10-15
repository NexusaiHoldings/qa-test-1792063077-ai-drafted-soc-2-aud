/**
 * System config admin API.
 *
 * Ported 2026-05-12 from api/system_config.py.
 *   GET /api/admin/config        — list keys (sensitive values redacted)
 *   GET /api/admin/config/{key}  — get single key
 *   PUT /api/admin/config/{key}  — set/update value
 *
 * Sensitive keys (secret/password/api_key/token/credential/private_key)
 * have values redacted in API output. Writes admin_audit_log entry on
 * every PUT. Publishes admin.system_config_changed.
 */

import { randomUUID } from "node:crypto";
import { checkAdminAuth, UNKNOWN_ADMIN_USER_ID } from "./_lib/admin";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const SENSITIVE_RE = /(secret|password|api_key|token|credential|private_key)/i;

function redact(key: string, value: unknown): unknown {
  return SENSITIVE_RE.test(key) ? "<redacted>" : value;
}

async function writeAudit(
  ctx: HandlerContext,
  adminId: string,
  key: string,
): Promise<void> {
  try {
    await ctx.db.execute(
      "INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, payload) " +
        "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)",
      randomUUID(),
      adminId,
      "put_config",
      "system_config",
      key,
      JSON.stringify({ key }),
    );
  } catch {
    // Audit logging is best-effort.
  }
}

export interface ListConfigInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly ctx: HandlerContext;
}

interface ConfigRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export async function handleListConfig({
  adminTokenHeader,
  adminToken,
  ctx,
}: ListConfigInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  try {
    const rows = await ctx.db.query<ConfigRow>(
      "SELECT key, value, updated_at FROM system_config ORDER BY key",
    );
    return ok({
      config: rows.map((r) => ({
        key: r.key,
        value: redact(r.key, r.value),
        updated_at: r.updated_at,
      })),
    });
  } catch {
    return err(500, "internal error");
  }
}

export interface GetConfigInput extends ListConfigInput {
  readonly key: string;
}

export async function handleGetConfig({
  adminTokenHeader,
  adminToken,
  key,
  ctx,
}: GetConfigInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  try {
    const rows = await ctx.db.query<ConfigRow>(
      "SELECT key, value, updated_at FROM system_config WHERE key=$1 LIMIT 1",
      key,
    );
    if (rows.length === 0) return err(404, "config key not found");
    const r = rows[0];
    return ok({
      key: r.key,
      value: redact(r.key, r.value),
      updated_at: r.updated_at,
    });
  } catch {
    return err(500, "internal error");
  }
}

export interface PutConfigInput extends ListConfigInput {
  readonly key: string;
  readonly adminUserId?: string;
  readonly body: { value?: unknown };
}

export async function handlePutConfig({
  adminTokenHeader,
  adminToken,
  adminUserId,
  key,
  body,
  ctx,
}: PutConfigInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  if (!Object.prototype.hasOwnProperty.call(body, "value")) {
    return err(400, "value required");
  }
  const adminId = adminUserId || UNKNOWN_ADMIN_USER_ID;
  try {
    await ctx.db.execute(
      "INSERT INTO system_config (key, value, updated_at, updated_by) " +
        "VALUES ($1, $2::jsonb, NOW(), $3::uuid) " +
        "ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW(), updated_by=EXCLUDED.updated_by",
      key,
      JSON.stringify(body.value),
      adminId,
    );
  } catch {
    return err(500, "internal error");
  }
  await writeAudit(ctx, adminId, key);
  await ctx.events.publish("admin.system_config_changed", { key });
  return ok({ status: "updated", key });
}
