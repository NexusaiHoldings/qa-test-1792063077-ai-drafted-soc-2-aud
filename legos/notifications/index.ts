/**
 * @nexus/notifications — public barrel.
 *
 * Substrate apps/web/app/api/notifications shims import handlers from here.
 * UI components import from "./ui".
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #6.
 */

// ── handlers ──
export {
  handleSendNotification,
  handleInbox,
  handleMarkRead,
} from "./api/dispatch";
export {
  handleGetPreferences,
  handleSetPreferences,
  handleRegisterWebPush,
} from "./api/preferences";

// ── config + context types ──
export type { NotificationsConfig } from "./api/dispatch";
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "notifications" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
