/**
 * Knowledge compile — POST /api/memory/compile.
 *
 * Ported 2026-05-12 from api/compile.py. Triggers a knowledge-compiler
 * run that scans long-term memory_items for patterns. Debounce-aware
 * (configurable; default 5min); pass force=true to bypass.
 *
 * NB: the actual pattern-extraction logic lives in
 * services/portfolio-runtime/reflection/. This endpoint just records
 * the run-marker row and enqueues the runtime job.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

export interface CompileConfig {
  readonly knowledge_compiler_debounce_seconds?: number;
}

export interface CompileInput {
  readonly body: { portfolio_company_id?: string; force?: boolean };
  readonly config: CompileConfig;
  readonly ctx: HandlerContext;
}

export async function handleCompileKnowledge({
  body,
  config,
  ctx,
}: CompileInput): Promise<HandlerResult> {
  const debounceSeconds = config.knowledge_compiler_debounce_seconds ?? 300;
  const companyId = parseUuid(body.portfolio_company_id);
  if (!companyId) return err(400, "portfolio_company_id_required");
  const force = body.force === true;

  if (!force) {
    try {
      const rows = await ctx.db.query<{ started_at: string }>(
        "SELECT id, started_at FROM portfolio_knowledge_compiler_runs " +
          "WHERE portfolio_company_id = $1::uuid ORDER BY started_at DESC LIMIT 1",
        companyId,
      );
      if (rows.length > 0) {
        const lastRunMs = new Date(rows[0].started_at).getTime();
        const ageSec = (Date.now() - lastRunMs) / 1000;
        if (ageSec < debounceSeconds) {
          return {
            status: 429,
            body: {
              error: "debounced",
              last_run: rows[0].started_at,
              retry_after_seconds: Math.ceil(debounceSeconds - ageSec),
            },
          };
        }
      }
    } catch {
      // Best-effort debounce — fall through to compile.
    }
  }

  const runId = randomUUID();
  try {
    await ctx.db.execute(
      "INSERT INTO portfolio_knowledge_compiler_runs (id, portfolio_company_id, status, started_at) " +
        "VALUES ($1::uuid, $2::uuid, 'queued', now())",
      runId,
      companyId,
    );
  } catch {
    return err(500, "internal error");
  }

  // Hand off to portfolio-runtime via NATS — the runtime worker does the
  // pattern extraction and updates the run row when complete.
  await ctx.events.publish("memory.compile_requested", {
    run_id: runId,
    company_id: companyId,
  });

  return ok({
    run_id: runId,
    rows_processed: 0,
    patterns_extracted: 0,
    status: "queued",
  });
}
