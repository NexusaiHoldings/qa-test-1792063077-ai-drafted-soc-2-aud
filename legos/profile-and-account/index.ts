/**
 * @nexus/profile-and-account — public barrel.
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #2.
 */

// ── handlers ──
export {
  handleGetProfile,
  handleUpdateProfile,
  handleListConnectedAccounts,
  handleRequestExport,
} from "./api/profile";

// ── UI components ──
export { ProfileSettingsPanel } from "./ui/components/ProfileSettingsPanel";
export { AccountExportButton } from "./ui/components/AccountExportButton";

// ── handler context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "profile-and-account" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
