/**
 * Audit log admin API.
 *
 * Ported 2026-05-12 from api/audit_log.py.
 *   GET /api/admin/audit — paginated audit log; filterable by admin_user_id,
 *                          target_type, target_id, action, from_ts, to_ts.
 */

import { checkAdminAuth } from "./_lib/admin";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

export interface ListAuditInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly query: {
    admin_user_id?: string;
    target_type?: string;
    target_id?: string;
    action?: string;
    from_ts?: string;
    to_ts?: string;
    limit?: string;
    offset?: string;
  };
  readonly ctx: HandlerContext;
}

interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  performed_at: string;
}

export async function handleListAudit({
  adminTokenHeader,
  adminToken,
  query,
  ctx,
}: ListAuditInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }

  const limit = Math.min(parseInt(query.limit || "50", 10) || 50, 200);
  const offset = parseInt(query.offset || "0", 10) || 0;

  const parts: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const filterMap: Array<[keyof typeof query, string, boolean]> = [
    ["admin_user_id", "admin_user_id", true],
    ["target_type", "target_type", false],
    ["target_id", "target_id", false],
    ["action", "action", false],
  ];
  for (const [qsKey, col, isUuid] of filterMap) {
    const v = query[qsKey];
    if (v) {
      parts.push(`${col}=$${i}${isUuid ? "::uuid" : ""}`);
      params.push(v);
      i++;
    }
  }
  if (query.from_ts) {
    parts.push(`performed_at >= $${i}`);
    params.push(query.from_ts);
    i++;
  }
  if (query.to_ts) {
    parts.push(`performed_at <= $${i}`);
    params.push(query.to_ts);
    i++;
  }

  const where = parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
  params.push(limit, offset);
  const sql =
    "SELECT id, admin_user_id, action, target_type, target_id, payload, performed_at " +
    `FROM admin_audit_log ${where} ORDER BY performed_at DESC LIMIT $${i} OFFSET $${i + 1}`;

  try {
    const rows = await ctx.db.query<AuditRow>(sql, ...params);
    return ok({
      entries: rows.map((r) => ({
        id: r.id,
        admin_user_id: r.admin_user_id,
        action: r.action,
        target_type: r.target_type || "",
        target_id: r.target_id || "",
        payload: r.payload,
        performed_at: r.performed_at,
      })),
      offset,
      limit,
    });
  } catch {
    return err(500, "internal error");
  }
}
