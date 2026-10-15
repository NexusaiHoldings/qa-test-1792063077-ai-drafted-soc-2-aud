/**
 * @nexus/admin-console — public barrel.
 *
 * Admin shell + sections registry + feature flags + system config + audit log.
 * Other legos register their admin pages via sections.
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #11 + §4.5
 * (Admin Contribution Contract).
 */

// ── handlers ──
export {
  handleListFlags,
  handleGetFlag,
  handleCreateFlag,
  handleUpdateFlag,
  handleDeleteFlag,
} from "./api/feature_flags";
export {
  handleListSections,
  handleRegisterSection,
  handleUnregisterSection,
} from "./api/sections";
export {
  handleListConfig,
  handleGetConfig,
  handlePutConfig,
} from "./api/system_config";
export { handleListAudit } from "./api/audit_log";

// ── helpers exported for cross-lego use ──
export { checkAdminAuth, UNKNOWN_ADMIN_USER_ID } from "./api/_lib/admin";

// ── context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "admin-console" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
