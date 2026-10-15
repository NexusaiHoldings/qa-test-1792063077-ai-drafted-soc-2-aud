/**
 * @nexus/crm-and-lifecycle — public barrel.
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #15 + §12
 * (the agent runs the pipeline; the salesperson approves).
 */

// ── contact / lead handlers ──
export {
  handleCaptureLead,
  handleListContacts,
  handleGetContact,
  handleLogInteraction,
  handleApplyScore,
  handleAdvanceStage,
} from "./api/contacts";

// ── outreach handlers ──
export {
  handleCreateOutreachDraft,
  handleListOutreachDrafts,
  handleApproveOutreach,
  handleMarkOutreachSent,
} from "./api/outreach";

// ── UI components ──
export { LeadCaptureForm } from "./ui/components/LeadCaptureForm";
export { ContactSidebar } from "./ui/components/ContactSidebar";

// ── handler context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata (consumed by _legos_config_generator) ──
export const LEGO_NAME = "crm-and-lifecycle" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
