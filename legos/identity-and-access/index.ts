/**
 * @nexus/identity-and-access — public barrel.
 *
 * Substrate apps/web/app/api/auth/<x>/route.ts shims import handlers from here
 * and call them with HandlerContext. UI components import from "./ui".
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #1.
 */

// ── handlers ──
export { handleLogin } from "./api/login";
export { handleSignup } from "./api/signup";
export { handleLogout } from "./api/logout";
export { handleSession } from "./api/session";
export {
  handlePasswordResetRequest,
  handlePasswordResetConfirm,
} from "./api/password_reset";
export {
  handleMfaEnrollTotp,
  handleMfaEnrollVerify,
  handleMfaChallenge,
  handleMfaRecoveryCode,
} from "./api/mfa";
export { handleOauthStart, handleOauthCallback } from "./api/oauth";
export {
  handleDeleteAccount,
  handleCancelDeletion,
  handleListSessions,
  handleRevokeSession,
  handleLoginHistory,
} from "./api/account";

// ── handler context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata (consumed by _legos_config_generator) ──
export const LEGO_NAME = "identity-and-access" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
