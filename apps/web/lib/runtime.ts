/**
 * Portfolio runtime client — SERVER-side bridge to services/portfolio-runtime/
 * (Layer 2 per NEXUS_PORTFOLIO_RUNTIME_SPEC.md §5).
 *
 * Phase 2c (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23):
 * thin wrapper that bundles the bearer token + base URL + company slug
 * from server-side env vars into a RuntimeRequestOpts. The token is
 * READ-ONLY here and NEVER passed to the browser (would leak via React
 * tree serialization — see ADR 0025 + contract hard-stop #6).
 *
 * Browser-side components MUST go through apps/web/app/api/runtime/* proxy
 * routes (which call this helper server-side). See
 * lib/runtime-client-browser.ts for the browser-facing surface.
 */

import {
  type RuntimeRequestOpts,
  listThreads as _listThreads,
  createThread as _createThread,
  getThread as _getThread,
  listMessages as _listMessages,
  sendMessage as _sendMessage,
  fetchApprovedActions as _fetchApprovedActions,
  completeApprovedAction as _completeApprovedAction,
} from "@nexus-substrate/runtime-client";

/**
 * Build a RuntimeRequestOpts from server-side env vars.
 *
 * Throws on missing required env (RUNTIME_BASE_URL or RUNTIME_AUTH_TOKEN)
 * so misconfiguration surfaces at the first request rather than silently
 * returning 401s. COMPANY_SLUG falls back to "unknown" — the runtime's
 * auth layer rejects mismatch, so this is safe.
 */
export function getRuntimeRequestOpts(): RuntimeRequestOpts {
  const baseUrl = process.env.RUNTIME_BASE_URL;
  const authToken = process.env.RUNTIME_AUTH_TOKEN;
  const companySlug = process.env.COMPANY_SLUG ?? "unknown";

  if (!baseUrl) {
    throw new Error(
      "runtime: RUNTIME_BASE_URL env var missing. " +
        "Provisioning (Phase 2d) should have set this; check companies.runtime_auth_token DB row.",
    );
  }
  if (!authToken) {
    throw new Error(
      "runtime: RUNTIME_AUTH_TOKEN env var missing. " +
        "Provisioning (Phase 2d) should have set this; check companies.runtime_auth_token DB row.",
    );
  }
  return { baseUrl, authToken, companySlug };
}

// Re-export the typed helpers for server-side use (proxy routes call these).
export const listThreads = _listThreads;
export const createThread = _createThread;
export const getThread = _getThread;
export const listMessages = _listMessages;
export const sendMessage = _sendMessage;
// cross-boundary mutation bridge — the approved-actions cron route calls these.
export const fetchApprovedActions = _fetchApprovedActions;
export const completeApprovedAction = _completeApprovedAction;

export type { RuntimeRequestOpts };
