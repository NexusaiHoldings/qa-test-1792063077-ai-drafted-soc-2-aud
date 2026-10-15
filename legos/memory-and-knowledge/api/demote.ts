/**
 * Memory demote — POST /api/memory/contradict + POST /api/memory/evict-low-utility.
 *
 * Ported 2026-05-12 from api/demote.py. Two paths to demote a long-term
 * memory from active → demoted status:
 *   - contradiction_count crosses threshold (configurable)
 *   - no retrieval for N days (configurable)
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

export interface DemoteConfig {
  readonly contradiction_threshold?: number;
  readonly long_term_eviction_no_retrieval_days?: number;
}

export interface RecordContradictionInput {
  readonly body: { memory_id?: string };
  readonly config: DemoteConfig;
  readonly ctx: HandlerContext;
}

export async function handleRecordContradiction({
  body,
  config,
  ctx,
}: RecordContradictionInput): Promise<HandlerResult> {
  const threshold = config.contradiction_threshold ?? 3;
  const memoryId = parseUuid(body.memory_id);
  if (!memoryId) return err(400, "memory_id_required");

  let rows: Array<{ id: string; contradiction_count: number }>;
  try {
    rows = await ctx.db.query(
      "UPDATE memory_items SET contradiction_count = contradiction_count + 1 " +
        "WHERE id = $1::uuid AND memory_tier = 'long_term' AND status = 'active' " +
        "RETURNING id, contradiction_count",
      memoryId,
    );
  } catch {
    return err(500, "internal error");
  }
  if (rows.length === 0) return err(404, "memory_not_found_or_not_active");

  const count = rows[0].contradiction_count;
  let demoted = false;
  if (count >= threshold) {
    try {
      await ctx.db.execute(
        "UPDATE memory_items SET status = 'demoted' WHERE id = $1::uuid",
        memoryId,
      );
      demoted = true;
    } catch {
      // demote attempt failed; report contradiction count nonetheless
    }
  }
  return ok({ memory_id: memoryId, contradiction_count: count, demoted });
}

export interface EvictLowUtilityInput {
  readonly body: { portfolio_company_id?: string; dry_run?: boolean };
  readonly config: DemoteConfig;
  readonly ctx: HandlerContext;
}

export async function handleEvictLowUtility({
  body,
  config,
  ctx,
}: EvictLowUtilityInput): Promise<HandlerResult> {
  const noRetrievalDays = config.long_term_eviction_no_retrieval_days ?? 90;
  const companyId = parseUuid(body.portfolio_company_id);
  if (!companyId) return err(400, "portfolio_company_id_required");
  const dryRun = body.dry_run === true;

  try {
    let count = 0;
    if (dryRun) {
      const rows = await ctx.db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM memory_items " +
          "WHERE portfolio_company_id = $1::uuid AND memory_tier = 'long_term' AND status = 'active' " +
          "AND (last_retrieved_at IS NULL OR last_retrieved_at < now() - ($2 || ' days')::interval)",
        companyId,
        String(noRetrievalDays),
      );
      count = rows[0]?.n ?? 0;
    } else {
      const rows = await ctx.db.query<{ n: number }>(
        "WITH demoted AS (" +
          "  UPDATE memory_items SET status = 'demoted' " +
          "  WHERE portfolio_company_id = $1::uuid AND memory_tier = 'long_term' AND status = 'active' " +
          "  AND (last_retrieved_at IS NULL OR last_retrieved_at < now() - ($2 || ' days')::interval) " +
          "  RETURNING 1" +
          ") SELECT count(*)::int AS n FROM demoted",
        companyId,
        String(noRetrievalDays),
      );
      count = rows[0]?.n ?? 0;
    }
    return ok({ company_id: companyId, demoted_count: count, dry_run: dryRun });
  } catch {
    return err(500, "internal error");
  }
}
