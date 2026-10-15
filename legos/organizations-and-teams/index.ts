/**
 * @nexus/organizations-and-teams — public barrel.
 *
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #3.
 */

// ── handlers ──
export {
  handleCreateOrg,
  handleListMembers,
  handleInviteMember,
  handleAcceptInvitation,
  handleChangeRole,
} from "./api/orgs";

// ── UI components ──
export { MembersTable } from "./ui/components/MembersTable";
export { OrgSwitcher } from "./ui/components/OrgSwitcher";

// ── handler context types ──
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";

// ── manifest metadata ──
export const LEGO_NAME = "organizations-and-teams" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
