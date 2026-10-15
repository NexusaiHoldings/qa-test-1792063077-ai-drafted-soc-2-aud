/**
 * Memory forget — POST /api/memory/forget.
 *
 * Ported 2026-05-12 from api/forget.py. GDPR-style hard delete of all
 * memory rows belonging to a user. Idempotent: a second call returns
 * counts of 0 and writes another audit row.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

export interface ForgetInput {
  readonly body: {
    portfolio_company_id?: string;
    portfolio_user_id?: string;
    requested_by_user_id?: string;
    reason?: string;
  };
  readonly ctx: HandlerContext;
}

export async function handleForgetUser({
  body,
  ctx,
}: ForgetInput): Promise<HandlerResult> {
  const companyId = parseUuid(body.portfolio_company_id);
  const userId = parseUuid(body.portfolio_user_id);
  const requestedBy = parseUuid(body.requested_by_user_id);

  if (!companyId) return err(400, "portfolio_company_id_required");
  if (!userId) return err(400, "portfolio_user_id_required");
  const reason = body.reason || "user_request";

  try {
    const longTermRows = await ctx.db.query<{ n: number }>(
      "WITH del AS (" +
        "  DELETE FROM memory_items " +
        "  WHERE portfolio_company_id = $1::uuid AND portfolio_user_id = $2::uuid " +
        "  RETURNING 1" +
        ") SELECT count(*)::int AS n FROM del",
      companyId,
      userId,
    );
    const workingRows = await ctx.db.query<{ n: number }>(
      "WITH del AS (" +
        "  DELETE FROM portfolio_runtime_memory " +
        "  WHERE portfolio_company_id = $1::uuid AND portfolio_user_id = $2::uuid " +
        "  RETURNING 1" +
        ") SELECT count(*)::int AS n FROM del",
      companyId,
      userId,
    );

    const auditId = randomUUID();
    await ctx.db.execute(
      "INSERT INTO portfolio_memory_forget_log " +
        "(id, portfolio_company_id, portfolio_user_id, requested_by_user_id, reason, rows_deleted_memory_items, rows_deleted_runtime_memory) " +
        "VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7)",
      auditId,
      companyId,
      userId,
      requestedBy,
      reason,
      longTermRows[0]?.n ?? 0,
      workingRows[0]?.n ?? 0,
    );

    await ctx.events.publish("memory.user_forgotten", {
      company_id: companyId,
      user_id: userId,
      rows_deleted: (longTermRows[0]?.n ?? 0) + (workingRows[0]?.n ?? 0),
    });

    return ok({
      rows_deleted_memory_items: longTermRows[0]?.n ?? 0,
      rows_deleted_runtime_memory: workingRows[0]?.n ?? 0,
      audit_id: auditId,
    });
  } catch {
    return err(500, "internal error");
  }
}
