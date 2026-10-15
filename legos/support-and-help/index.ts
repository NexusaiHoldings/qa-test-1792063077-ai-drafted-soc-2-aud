/**
 * @nexus/support-and-help — public barrel.
 *
 * Substrate apps/web/app/api/support/<x>/route.ts shims import handlers from
 * here and call them with HandlerContext. UI components import from "./ui".
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #7 + §12
 * (AI-as-Backbone: the agent runs first-line support).
 */

// ── ticket handlers ──
export {
  handleCreateTicket,
  handleListTickets,
  handleGetTicket,
  handleAppendMessage,
  handleEscalateTicket,
  handleResolveTicket,
} from "./api/tickets";

// ── knowledge-base handlers ──
export {
  handleListArticles,
  handleGetArticle,
  handleSearchArticles,
} from "./api/kb";

// ── feedback handler ──
export { handleSubmitFeedback } from "./api/feedback";

// ── UI components ──
export { SupportWidget } from "./ui/components/SupportWidget";
export { TicketList } from "./ui/components/TicketList";

// ── handler context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata (consumed by _legos_config_generator) ──
export const LEGO_NAME = "support-and-help" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
