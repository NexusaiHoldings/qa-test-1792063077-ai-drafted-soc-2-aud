/**
 * Memory recall — GET /api/memory/recall.
 *
 * Ported 2026-05-12 from api/recall.py.
 * Side effect: touches last_accessed_at (working) / increments retrieval_count
 * + last_retrieved_at (long_term) on returned rows.
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

const MAX_LIMIT = 200;

export interface RecallInput {
  readonly query: {
    portfolio_company_id?: string;
    memory_tier?: string;
    portfolio_user_id?: string;
    memory_kind?: string;
    discipline?: string;
    limit?: string;
  };
  readonly ctx: HandlerContext;
}

export async function handleRecallMemories({
  query,
  ctx,
}: RecallInput): Promise<HandlerResult> {
  const companyId = parseUuid(query.portfolio_company_id);
  if (!companyId) return err(400, "portfolio_company_id_required");

  const tier = query.memory_tier;
  if (tier !== "working" && tier !== "long_term") {
    return err(400, "invalid_memory_tier; expected: working,long_term");
  }

  const userId = parseUuid(query.portfolio_user_id);
  const limit = Math.max(1, Math.min(parseInt(query.limit || "50", 10) || 50, MAX_LIMIT));

  if (tier === "working") {
    const params: unknown[] = [companyId];
    const where: string[] = ["portfolio_company_id = $1::uuid", "expires_at > now()"];
    if (userId) {
      params.push(userId);
      where.push(`portfolio_user_id = $${params.length}::uuid`);
    }
    if (query.memory_kind) {
      params.push(query.memory_kind);
      where.push(`memory_kind = $${params.length}`);
    }
    params.push(limit);
    const sql =
      "SELECT id, portfolio_company_id, portfolio_user_id, workflow_id, memory_kind, payload, last_accessed_at, expires_at, created_at " +
      `FROM portfolio_runtime_memory WHERE ${where.join(" AND ")} ` +
      `ORDER BY last_accessed_at DESC LIMIT $${params.length}`;
    try {
      const rows = await ctx.db.query<{ id: string }>(sql, ...params);
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        await ctx.db.execute(
          "UPDATE portfolio_runtime_memory SET last_accessed_at = now() WHERE id = ANY($1::uuid[])",
          ids,
        );
      }
      return ok({ memories: rows, count: rows.length });
    } catch {
      return err(500, "internal error");
    }
  }

  // long_term
  const params: unknown[] = [companyId];
  const where: string[] = [
    "portfolio_company_id = $1::uuid",
    "memory_tier = 'long_term'",
    "status = 'active'",
  ];
  if (userId) {
    params.push(userId);
    where.push(`portfolio_user_id = $${params.length}::uuid`);
  }
  if (query.discipline) {
    params.push(query.discipline);
    where.push(`discipline = $${params.length}`);
  }
  params.push(limit);
  const sql =
    "SELECT id, portfolio_company_id, portfolio_user_id, scope_type, discipline, " +
    "memory_type, payload_json, importance, retrieval_count, contradiction_count, last_retrieved_at, created_at " +
    `FROM memory_items WHERE ${where.join(" AND ")} ` +
    `ORDER BY created_at DESC LIMIT $${params.length}`;
  try {
    const rows = await ctx.db.query<{ id: string }>(sql, ...params);
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      await ctx.db.execute(
        "UPDATE memory_items SET retrieval_count = retrieval_count + 1, last_retrieved_at = now() WHERE id = ANY($1::uuid[])",
        ids,
      );
    }
    return ok({ memories: rows, count: rows.length });
  } catch {
    return err(500, "internal error");
  }
}
