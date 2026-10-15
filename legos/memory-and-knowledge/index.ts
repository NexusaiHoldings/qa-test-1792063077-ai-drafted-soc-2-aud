/**
 * @nexus/memory-and-knowledge — public barrel.
 *
 * Agent runtime memory: working (TTL) + long_term (eviction-by-signal) +
 * knowledge compiler. Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §5.6.
 *
 * This lego is the 16th capability (post-spec addition, 2026-05-12) —
 * spec §11 lists 15 capabilities; chairman confirmed memory-and-knowledge
 * as the 16th alongside them, all bundled in every substrate.
 */

// ── handlers ──
export { handleStoreMemory } from "./api/store";
export { handleRecallMemories } from "./api/recall";
export { handlePromoteMemory } from "./api/promote";
export {
  handleRecordContradiction,
  handleEvictLowUtility,
} from "./api/demote";
export { handleForgetUser } from "./api/forget";
export { handleMemoryStats } from "./api/stats";
export { handleCompileKnowledge } from "./api/compile";

// ── config + context types ──
export type { MemoryConfig } from "./api/store";
export type { DemoteConfig } from "./api/demote";
export type { StatsConfig } from "./api/stats";
export type { CompileConfig } from "./api/compile";
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "memory-and-knowledge" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
