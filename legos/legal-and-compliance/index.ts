/**
 * @nexus/legal-and-compliance — public barrel.
 *
 * Substrate apps/web/app/api/legal/... shims import handlers from here.
 * UI components import from "./ui".
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #5.
 */

// ── handlers ──
export {
  handleListDocuments,
  handleListAllDocuments,
  handleGetDocument,
  handlePublishDocument,
} from "./api/documents";
export {
  handleAcknowledge,
  handleMyAcknowledgments,
  handleMissingAcknowledgments,
} from "./api/acknowledgments";
export {
  handleGiveConsent,
  handleGetCurrentConsent,
} from "./api/cookies";

// ── handler context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "legal-and-compliance" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
