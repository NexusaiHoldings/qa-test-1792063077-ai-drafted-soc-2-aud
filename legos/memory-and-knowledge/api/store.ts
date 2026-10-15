/**
 * Memory store — POST /api/memory/store.
 *
 * Ported 2026-05-12 from api/store.py. Two tiers:
 *   - working: portfolio_runtime_memory table, TTL-based eviction
 *   - long_term: memory_items table, no expiry (eviction by retrieval signal)
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §5.6 (memory model).
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { parseUuid } from "./_lib/uuid";

const VALID_TIERS = ["working", "long_term"] as const;
const VALID_WORKING_KINDS = [
  "active_goal",
  "in_flight_task",
  "pending_approval",
  "planned_action",
  "tool_call_history",
] as const;

export interface MemoryConfig {
  readonly working_memory_ttl_days?: number;
}

export interface StoreInput {
  readonly body: {
    portfolio_company_id?: string;
    portfolio_user_id?: string;
    memory_tier?: string;
    payload?: unknown;
    memory_kind?: string;
    workflow_id?: string;
    ttl_days?: number;
    discipline?: string;
    memory_type?: string;
    importance?: string;
  };
  readonly config: MemoryConfig;
  readonly ctx: HandlerContext;
}

export async function handleStoreMemory({
  body,
  config,
  ctx,
}: StoreInput): Promise<HandlerResult> {
  const defaultTtl = config.working_memory_ttl_days ?? 7;

  const companyId = parseUuid(body.portfolio_company_id);
  if (!companyId) return err(400, "portfolio_company_id_required");

  const tier = body.memory_tier;
  if (tier !== "working" && tier !== "long_term") {
    return err(400, `invalid_memory_tier; expected: ${VALID_TIERS.join(",")}`);
  }

  if (!body.payload || typeof body.payload !== "object") {
    return err(400, "payload_must_be_object");
  }

  const userId = parseUuid(body.portfolio_user_id);

  if (tier === "working") {
    const kind = body.memory_kind || "";
    if (!(VALID_WORKING_KINDS as readonly string[]).includes(kind)) {
      return err(400, `invalid_memory_kind; expected: ${VALID_WORKING_KINDS.join(",")}`);
    }
    const workflowId = parseUuid(body.workflow_id);
    const ttlDays = body.ttl_days ?? defaultTtl;
    if (!Number.isFinite(ttlDays) || ttlDays < 1 || ttlDays > 90) {
      return err(400, "ttl_days_out_of_range");
    }
    const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
    const memoryId = randomUUID();
    try {
      await ctx.db.execute(
        "INSERT INTO portfolio_runtime_memory " +
          "(id, portfolio_company_id, portfolio_user_id, workflow_id, memory_kind, payload, expires_at) " +
          "VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::jsonb, $7)",
        memoryId,
        companyId,
        userId,
        workflowId,
        kind,
        JSON.stringify(body.payload),
        expiresAt.toISOString(),
      );
      return ok({
        memory_id: memoryId,
        memory_tier: "working",
        expires_at: expiresAt.toISOString(),
      });
    } catch {
      return err(500, "internal error");
    }
  }

  // long_term tier
  const discipline = body.discipline || "general";
  const memoryType = body.memory_type || "decision";
  const importance = body.importance || "medium";
  const memoryId = randomUUID();
  try {
    await ctx.db.execute(
      "INSERT INTO memory_items " +
        "(id, portfolio_company_id, portfolio_user_id, scope_type, discipline, memory_type, payload_json, importance, status, memory_tier) " +
        "VALUES ($1::uuid, $2::uuid, $3::uuid, 'company', $4, $5, $6::jsonb, $7, 'active', 'long_term')",
      memoryId,
      companyId,
      userId,
      discipline,
      memoryType,
      JSON.stringify(body.payload),
      importance,
    );
    return ok({
      memory_id: memoryId,
      memory_tier: "long_term",
      expires_at: null,
    });
  } catch {
    return err(500, "internal error");
  }
}
