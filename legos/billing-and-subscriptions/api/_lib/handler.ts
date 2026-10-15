/**
 * Handler context + helpers for all identity-and-access route handlers.
 *
 * Substrate's app/api/<x>/route.ts builds a HandlerContext from request-scoped
 * dependencies (DB pool, event bus) and calls the lego's handler function.
 * Handlers are framework-agnostic — they take a parsed body and return a
 * structured Result that the substrate route wrapper translates to a
 * Next.js Response.
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
  /** Headers to set on the response (e.g., Set-Cookie). */
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

/**
 * Extract a Bearer token from an Authorization header value.
 * Returns null when header is missing or malformed.
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}
