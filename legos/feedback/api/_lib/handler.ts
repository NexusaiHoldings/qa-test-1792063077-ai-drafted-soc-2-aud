/**
 * Handler context + helpers for feedback route handlers.
 *
 * Substrate apps/web/app/api/feedback/* shims build a HandlerContext from
 * request-scoped deps (DB pool, event bus) and call the lego's handler.
 * Handlers are framework-agnostic — they take parsed params and return a
 * structured Result the substrate route wrapper translates to a Next.js
 * Response (apps/web/lib/lego-route.ts respond()).
 */

import type { Db } from "./db";
import type { EventBus } from "./events";

export interface HandlerContext {
  readonly db: Db;
  readonly events: EventBus;
}

export interface HandlerResult {
  readonly status: number;
  /** Plain-text body when status is non-2xx; JSON body when 2xx. */
  readonly body: string | Record<string, unknown>;
  readonly headers?: Record<string, string>;
}

/** Convenience: JSON success response. */
export function ok(body: Record<string, unknown>, status = 200): HandlerResult {
  return { status, body };
}

/** Convenience: plain-text error response. */
export function err(status: number, message: string): HandlerResult {
  return { status, body: message };
}
