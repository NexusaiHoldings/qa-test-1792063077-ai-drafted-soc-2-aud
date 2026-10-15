/**
 * @nexus/feedback — public barrel (feedback-to-build-loop-001).
 *
 * Substrate apps/web/app/api/feedback/* shims import handlers from here.
 * The FAB launcher imports from "./ui".
 */

// ── handlers ──
export {
  handleSubmitFeedback,
  handleListFeedback,
  handleFeedbackAction,
  handleAnswer,
  handleSyncFeedback,
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
  FEEDBACK_ACTIONS,
  EVENT_SUBMITTED,
  EVENT_ACTION,
  EVENT_ANSWER,
} from "./api/feedback";
export type {
  FeedbackType,
  FeedbackStatus,
  FeedbackAction,
} from "./api/feedback";

// ── context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "feedback" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
