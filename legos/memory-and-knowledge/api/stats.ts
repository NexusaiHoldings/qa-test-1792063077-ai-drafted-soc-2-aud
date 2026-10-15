/**
 * Memory stats — GET /api/memory/stats.
 *
 * Ported 2026-05-12 from api/stats.py. Returns counts + breakdowns for
 * both memory tiers, plus a low-utility-candidates estimate.
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

export interface StatsConfig {
  readonly long_term_eviction_no_retrieval_days?: number;
}

export interface StatsInput {
  readonly query: { portfolio_company_id?: string };
  readonly config: StatsConfig;
  readonly ctx: HandlerContext;
}

export async function handleMemoryStats({
  query,
  config,
  ctx,
}: StatsInput): Promise<HandlerResult> {
  const noRetrievalDays = config.long_term_eviction_no_retrieval_days ?? 90;
  const companyId = parseUuid(query.portfolio_company_id);
  if (!companyId) return err(400, "portfolio_company_id_required");

  try {
    const ltTotalRows = await ctx.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM memory_items " +
        "WHERE portfolio_company_id = $1::uuid AND memory_tier = 'long_term'",
      companyId,
    );

    const ltDisciplineRows = await ctx.db.query<{
      discipline: string;
      n: number;
    }>(
      "SELECT discipline, count(*)::int AS n FROM memory_items " +
        "WHERE portfolio_company_id = $1::uuid AND memory_tier = 'long_term' " +
        "GROUP BY discipline",
      companyId,
    );

    const lowUtilityRows = await ctx.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM memory_items " +
        "WHERE portfolio_company_id = $1::uuid AND memory_tier = 'long_term' AND status = 'active' " +
        "AND (last_retrieved_at IS NULL OR last_retrieved_at < now() - ($2 || ' days')::interval)",
      companyId,
      String(noRetrievalDays),
    );

    const wTotalRows = await ctx.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM portfolio_runtime_memory " +
        "WHERE portfolio_company_id = $1::uuid",
      companyId,
    );

    const wKindRows = await ctx.db.query<{ memory_kind: string; n: number }>(
      "SELECT memory_kind, count(*)::int AS n FROM portfolio_runtime_memory " +
        "WHERE portfolio_company_id = $1::uuid GROUP BY memory_kind",
      companyId,
    );

    const expiredRows = await ctx.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM portfolio_runtime_memory " +
        "WHERE portfolio_company_id = $1::uuid AND expires_at <= now()",
      companyId,
    );

    const forgetRows = await ctx.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM portfolio_memory_forget_log " +
        "WHERE portfolio_company_id = $1::uuid",
      companyId,
    );

    const lastCompileRows = await ctx.db.query<{ started_at: string }>(
      "SELECT started_at FROM portfolio_knowledge_compiler_runs " +
        "WHERE portfolio_company_id = $1::uuid ORDER BY started_at DESC LIMIT 1",
      companyId,
    );

    return ok({
      portfolio_company_id: companyId,
      long_term: {
        total: ltTotalRows[0]?.n ?? 0,
        by_discipline: Object.fromEntries(
          ltDisciplineRows.map((r) => [r.discipline, r.n]),
        ),
        low_utility_candidates: lowUtilityRows[0]?.n ?? 0,
      },
      working: {
        total: wTotalRows[0]?.n ?? 0,
        by_kind: Object.fromEntries(wKindRows.map((r) => [r.memory_kind, r.n])),
        expired_pending_cleanup: expiredRows[0]?.n ?? 0,
      },
      forget_log_count: forgetRows[0]?.n ?? 0,
      last_compiler_run: lastCompileRows[0]?.started_at ?? null,
    });
  } catch {
    return err(500, "internal error");
  }
}
