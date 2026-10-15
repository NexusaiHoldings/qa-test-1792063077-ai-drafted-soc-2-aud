/**
 * @nexus/social-and-engagement — public barrel.
 * Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC.md §11 capability #14.
 */
export { handlePostComment, handleListComments, handleReact, handleHideComment } from "./api/social";
export { CommentThread } from "./ui/components/CommentThread";
export type { HandlerContext, HandlerResult } from "./api/_lib/handler";
export type { Db, DbRow } from "./api/_lib/db";
export type { EventBus } from "./api/_lib/events";
export const LEGO_NAME = "social-and-engagement" as const;
export const LEGO_VERSION = "1.0.0" as const;
export const IS_STUB = false as const;
