/**
 * @nexus/analytics-and-telemetry — public barrel.
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #13.
 */
export { handleRecordEvent, handleEventCounts, handleListFunnels, handleAnalyticsSummary } from "./api/analytics";
export { AnalyticsDashboard } from "./ui/components/AnalyticsDashboard";
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";
export const LEGO_NAME = "analytics-and-telemetry" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
