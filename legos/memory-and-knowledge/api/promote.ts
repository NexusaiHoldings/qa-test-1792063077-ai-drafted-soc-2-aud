/**
 * Memory promote — POST /api/memory/promote.
 *
 * Ported 2026-05-12 from api/promote.py. Transitions a working memory row
 * to long-term storage. The reflection engine (services/portfolio-runtime/
 * reflection/) decides when to call this; this endpoint is pure data plane.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

export interface PromoteInput {
  readonly body: {
    working_memory_id?: string;
    discipline?: string;
    memory_type?: string;
    importance?: string;
    summary?: string;
  };
  readonly ctx: HandlerContext;
}

export async function handlePromoteMemory({
  body,
  ctx,
}: PromoteInput): Promise<HandlerResult> {
  const workingId = parseUuid(body.working_memory_id);
  if (!workingId) return err(400, "working_memory_id_required");
  const discipline = body.discipline;
  if (!discipline) return err(400, "discipline_required");

  const memoryType = body.memory_type || "pattern";
  const importance = body.importance || "medium";

  let rows: Array<{
    portfolio_company_id: string;
    portfolio_user_id: string | null;
    payload: unknown;
  }>;
  try {
    rows = await ctx.db.query(
      "SELECT id, portfolio_company_id, portfolio_user_id, payload " +
        "FROM portfolio_runtime_memory WHERE id = $1::uuid",
      workingId,
    );
  } catch {
    return err(500, "internal error");
  }
  if (rows.length === 0) return err(404, "working_memory_not_found");

  let payload: Record<string, unknown> = {};
  const raw = rows[0].payload;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  } else if (raw && typeof raw === "object") {
    payload = raw as Record<string, unknown>;
  }

  if (body.summary) {
    payload = { ...payload, promoted_summary: body.summary };
  }

  const longTermId = randomUUID();
  try {
    await ctx.db.execute(
      "INSERT INTO memory_items " +
        "(id, portfolio_company_id, portfolio_user_id, scope_type, discipline, memory_type, payload_json, importance, status, memory_tier) " +
        "VALUES ($1::uuid, $2::uuid, $3::uuid, 'company', $4, $5, $6::jsonb, $7, 'active', 'long_term')",
      longTermId,
      rows[0].portfolio_company_id,
      rows[0].portfolio_user_id,
      discipline,
      memoryType,
      JSON.stringify(payload),
      importance,
    );
    await ctx.db.execute(
      "DELETE FROM portfolio_runtime_memory WHERE id = $1::uuid",
      workingId,
    );
  } catch {
    return err(500, "internal error");
  }

  return ok({
    long_term_memory_id: longTermId,
    working_memory_id: workingId,
  });
}
