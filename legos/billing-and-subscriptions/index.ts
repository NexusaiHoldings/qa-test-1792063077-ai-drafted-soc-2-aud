/**
 * @nexus/billing-and-subscriptions — public barrel.
 *
 * Stripe checkout + subscriptions + webhook + customer portal + plan changes
 * + usage metering + dunning state machine.
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #4.
 */

// ── handlers ──
export { handleCheckout } from "./api/checkout";
export {
  handleWebhook,
  verifyStripeSignature,
} from "./api/webhook";
export {
  handleGetSubscription,
  handleCancelSubscription,
  handleResumeSubscription,
  handleListSubscriptions,
} from "./api/subscriptions";
export { handlePortal } from "./api/portal";
export {
  handleRecordUsage,
  handleGetUsageSummary,
} from "./api/usage";
export {
  handlePreviewPlanChange,
  handleApplyPlanChange,
  handlePlanHistory,
} from "./api/plan_changes";
export {
  recordPaymentFailure,
  recordPaymentSuccess,
  handleListAtRisk,
} from "./api/dunning";

// ── config + context types ──
export type { BillingConfig, BillingTier } from "./api/checkout";
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "billing-and-subscriptions" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
