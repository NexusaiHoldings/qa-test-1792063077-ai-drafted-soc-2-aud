/**
 * Feature flags admin API.
 *
 * Ported 2026-05-12 from api/feature_flags.py.
 *   GET    /api/admin/flags        — list all flags
 *   GET    /api/admin/flags/{key}  — get single flag
 *   POST   /api/admin/flags        — create flag
 *   PATCH  /api/admin/flags/{key}  — update flag fields
 *   DELETE /api/admin/flags/{key}  — delete flag
 *
 * All endpoints require X-Admin-Token. All mutations write admin_audit_log.
 * Publishes admin.feature_flag_changed.
 */

import { randomUUID } from "node:crypto";
import { checkAdminAuth, UNKNOWN_ADMIN_USER_ID } from "./_lib/admin";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

interface FlagRow {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  rollout_percent: number;
  target_segments: unknown;
}

function serializeRow(r: FlagRow): Record<string, unknown> {
  return {
    id: r.id,
    key: r.key,
    enabled: r.enabled,
    description: r.description || "",
    rollout_percent: r.rollout_percent,
    target_segments: r.target_segments,
  };
}

const SELECT_COLS =
  "SELECT id, key, enabled, description, rollout_percent, target_segments FROM feature_flags";

async function writeAudit(
  ctx: HandlerContext,
  adminId: string,
  action: string,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await ctx.db.execute(
      "INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, payload) " +
        "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)",
      randomUUID(),
      adminId,
      action,
      "feature_flag",
      targetId,
      JSON.stringify(payload),
    );
  } catch {
    // Audit logging is best-effort.
  }
}

export interface AdminInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly adminUserId?: string;
  readonly ctx: HandlerContext;
}

export async function handleListFlags({
  adminTokenHeader,
  adminToken,
  ctx,
}: AdminInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  try {
    const rows = await ctx.db.query<FlagRow>(`${SELECT_COLS} ORDER BY key`);
    return ok({ flags: rows.map(serializeRow) });
  } catch {
    return err(500, "internal error");
  }
}

export interface GetFlagInput extends AdminInput {
  readonly key: string;
}

export async function handleGetFlag({
  adminTokenHeader,
  adminToken,
  key,
  ctx,
}: GetFlagInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  try {
    const rows = await ctx.db.query<FlagRow>(
      `${SELECT_COLS} WHERE key=$1 LIMIT 1`,
      key,
    );
    if (rows.length === 0) return err(404, "flag not found");
    return ok(serializeRow(rows[0]));
  } catch {
    return err(500, "internal error");
  }
}

export interface CreateFlagInput extends AdminInput {
  readonly body: {
    key?: string;
    enabled?: boolean;
    description?: string;
    rollout_percent?: number;
    target_segments?: unknown[];
  };
}

export async function handleCreateFlag({
  adminTokenHeader,
  adminToken,
  adminUserId,
  body,
  ctx,
}: CreateFlagInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  const key = body.key || "";
  if (!key) return err(400, "key required");
  const rp = body.rollout_percent ?? 0;
  if (!Number.isInteger(rp) || rp < 0 || rp > 100) {
    return err(400, "rollout_percent must be 0-100");
  }

  const id = randomUUID();
  try {
    await ctx.db.execute(
      "INSERT INTO feature_flags (id, key, enabled, description, rollout_percent, target_segments) " +
        "VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)",
      id,
      key,
      body.enabled === true,
      body.description || "",
      rp,
      JSON.stringify(body.target_segments || []),
    );
  } catch {
    return err(500, "internal error");
  }

  const adminId = adminUserId || UNKNOWN_ADMIN_USER_ID;
  await writeAudit(ctx, adminId, "create_flag", key, { key });
  await ctx.events.publish("admin.feature_flag_changed", {
    action: "created",
    key,
  });
  return ok({ id, key }, 201);
}

export interface UpdateFlagInput extends AdminInput {
  readonly key: string;
  readonly body: {
    enabled?: boolean;
    rollout_percent?: number;
    target_segments?: unknown[];
    description?: string;
  };
}

export async function handleUpdateFlag({
  adminTokenHeader,
  adminToken,
  adminUserId,
  key,
  body,
  ctx,
}: UpdateFlagInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }

  const parts: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (body.enabled !== undefined) {
    parts.push(`enabled=$${i}`);
    params.push(body.enabled === true);
    i++;
  }
  if (body.rollout_percent !== undefined) {
    const rp = body.rollout_percent;
    if (!Number.isInteger(rp) || rp < 0 || rp > 100) {
      return err(400, "rollout_percent must be 0-100");
    }
    parts.push(`rollout_percent=$${i}`);
    params.push(rp);
    i++;
  }
  if (body.target_segments !== undefined) {
    parts.push(`target_segments=$${i}::jsonb`);
    params.push(JSON.stringify(body.target_segments));
    i++;
  }
  if (body.description !== undefined) {
    parts.push(`description=$${i}`);
    params.push(body.description);
    i++;
  }

  if (parts.length === 0) return err(400, "no fields to update");
  parts.push("updated_at=NOW()");
  params.push(key);

  try {
    const rows = await ctx.db.query<{ id: string }>(
      `UPDATE feature_flags SET ${parts.join(", ")} WHERE key=$${i} RETURNING id`,
      ...params,
    );
    if (rows.length === 0) return err(404, "flag not found");
  } catch {
    return err(500, "internal error");
  }

  const adminId = adminUserId || UNKNOWN_ADMIN_USER_ID;
  await writeAudit(ctx, adminId, "update_flag", key, body as Record<string, unknown>);
  await ctx.events.publish("admin.feature_flag_changed", {
    action: "updated",
    key,
  });
  return ok({ status: "updated" });
}

export interface DeleteFlagInput extends AdminInput {
  readonly key: string;
}

export async function handleDeleteFlag({
  adminTokenHeader,
  adminToken,
  adminUserId,
  key,
  ctx,
}: DeleteFlagInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }
  try {
    const rows = await ctx.db.query<{ id: string }>(
      "DELETE FROM feature_flags WHERE key=$1 RETURNING id",
      key,
    );
    if (rows.length === 0) return err(404, "flag not found");
  } catch {
    return err(500, "internal error");
  }
  const adminId = adminUserId || UNKNOWN_ADMIN_USER_ID;
  await writeAudit(ctx, adminId, "delete_flag", key, {});
  await ctx.events.publish("admin.feature_flag_changed", {
    action: "deleted",
    key,
  });
  return ok({ status: "deleted" });
}
