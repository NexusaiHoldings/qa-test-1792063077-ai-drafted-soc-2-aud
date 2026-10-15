/**
 * Typed client for services/portfolio-runtime/ (Layer 2 per spec §5).
 *
 * Phase 2b (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23):
 * replaces the pre-Phase-2 stub with real conversation surface helpers.
 *
 * Every helper takes a RuntimeRequestOpts carrying the Bearer token + URL
 * base + company slug. The substrate's apps/web reads these from env
 * (RUNTIME_BASE_URL / RUNTIME_AUTH_TOKEN / COMPANY_SLUG) injected at
 * provisioning time (Phase 2d).
 *
 * SSE streaming uses fetch + ReadableStream + manual SSE line parsing.
 * The bearer token NEVER appears in URL query params (contract hard-stop
 * #6 — would land in access logs).
 *
 * The client is isomorphic (works in browser + Node 18+). Both the
 * standard fetch and the ReadableStream API are required for streaming.
 * Polling fallback runs if streaming isn't supported.
 */

import type {
  Thread,
  ThreadDetail,
  Message,
  SendMessageInput,
  ListMessagesOptions,
  RuntimeRequestOpts,
  RuntimeHealth,
  StreamHandlers,
  StreamSubscription,
  WorkflowState,
  ThreadStatus,
} from "./types";

import { RuntimeClientError } from "./types";

export * from "./types";

// ── Internals ───────────────────────────────────────────────────────────────

function _resolveFetch(opts: RuntimeRequestOpts): typeof fetch {
  if (opts.fetchImpl) return opts.fetchImpl;
  if (typeof fetch !== "undefined") return fetch;
  throw new Error(
    "runtime-client: no fetch implementation available. Provide opts.fetchImpl in non-browser contexts.",
  );
}

function _baseUrl(opts: RuntimeRequestOpts): string {
  return opts.baseUrl.replace(/\/+$/, "");
}

function _authHeaders(opts: RuntimeRequestOpts): Record<string, string> {
  return { Authorization: `Bearer ${opts.authToken}` };
}

async function _request<T>(
  opts: RuntimeRequestOpts,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const f = _resolveFetch(opts);
  const url = `${_baseUrl(opts)}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ..._authHeaders(opts),
  };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const resp = await f(url, { method, headers, body: payload });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new RuntimeClientError(resp.status, text);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function _slugPath(opts: RuntimeRequestOpts): string {
  return `/companies/${encodeURIComponent(opts.companySlug)}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function fetchHealth(opts: RuntimeRequestOpts): Promise<RuntimeHealth> {
  // /health is unauthenticated; send the bearer for consistency, runtime ignores.
  const f = _resolveFetch(opts);
  const resp = await f(`${_baseUrl(opts)}/health`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new RuntimeClientError(resp.status, await resp.text().catch(() => ""));
  }
  return (await resp.json()) as RuntimeHealth;
}

export async function listThreads(opts: RuntimeRequestOpts, limit?: number): Promise<Thread[]> {
  const qp = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return _request<Thread[]>(opts, "GET", `${_slugPath(opts)}/threads${qp}`);
}

export async function createThread(
  opts: RuntimeRequestOpts,
  body?: { title?: string },
): Promise<Thread> {
  return _request<Thread>(opts, "POST", `${_slugPath(opts)}/threads`, body ?? {});
}

export async function getThread(
  opts: RuntimeRequestOpts,
  threadId: string,
): Promise<ThreadDetail> {
  return _request<ThreadDetail>(
    opts,
    "GET",
    `${_slugPath(opts)}/threads/${encodeURIComponent(threadId)}`,
  );
}

export async function listMessages(
  opts: RuntimeRequestOpts,
  threadId: string,
  pageOpts?: ListMessagesOptions,
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (pageOpts?.limit !== undefined) params.set("limit", String(pageOpts.limit));
  if (pageOpts?.before) params.set("before", pageOpts.before);
  const qp = params.toString();
  return _request<Message[]>(
    opts,
    "GET",
    `${_slugPath(opts)}/threads/${encodeURIComponent(threadId)}/messages${qp ? `?${qp}` : ""}`,
  );
}

export async function sendMessage(
  opts: RuntimeRequestOpts,
  threadId: string,
  body: SendMessageInput,
): Promise<Message> {
  return _request<Message>(
    opts,
    "POST",
    `${_slugPath(opts)}/threads/${encodeURIComponent(threadId)}/messages`,
    body,
  );
}

// ── Cross-boundary mutation bridge (cross-boundary-mutation-bridge-001) ──────
//
// The runtime approves confirm-gated tools whose mutation lives in THIS app's
// DB (e.g. support-and-help's escalate_to_human). It can't reach our DB, so it
// queues the action; we pull pending actions, execute the matching lego handler
// locally, and report the result back. Same call direction as everything else
// (app → runtime), reusing the runtime_auth_token bearer — no new auth surface.

export interface ApprovedAction {
  id: string;
  tool_name: string;
  lego_name: string | null;
  args: Record<string, unknown>;
  workflow_id: string | null;
  created_at: string | null;
}

/** Pull (and claim) this company's pending approved actions. */
export async function fetchApprovedActions(
  opts: RuntimeRequestOpts,
  limit?: number,
): Promise<ApprovedAction[]> {
  const qp = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
  const r = await _request<{ actions: ApprovedAction[]; count: number }>(
    opts,
    "GET",
    `${_slugPath(opts)}/approved-actions${qp}`,
  );
  return r.actions ?? [];
}

/** Report the outcome of a locally-executed approved action back to the runtime. */
export async function completeApprovedAction(
  opts: RuntimeRequestOpts,
  actionId: string,
  body: { status: "completed" | "failed"; result?: Record<string, unknown>; error?: string },
): Promise<{ action_id: string; status: string }> {
  return _request(
    opts,
    "POST",
    `${_slugPath(opts)}/approved-actions/${encodeURIComponent(actionId)}/complete`,
    body,
  );
}

/**
 * Subscribe to live updates for a thread via Server-Sent Events.
 *
 * Implementation uses fetch + ReadableStream + manual SSE line parsing.
 * The bearer token is sent as a header (Authorization: Bearer ...) — it
 * never appears in URL query params (contract hard-stop #6).
 *
 * Returns a subscription with `close()` to disconnect. The runtime emits
 * a `ready` event so handlers know the stream is alive.
 *
 * If fetch.body (ReadableStream) is unavailable — older Node, restricted
 * environments — falls back to polling every 2s.
 */
export function subscribeToThread(
  opts: RuntimeRequestOpts,
  threadId: string,
  handlers: StreamHandlers,
): StreamSubscription {
  const url = `${_baseUrl(opts)}${_slugPath(opts)}/threads/${encodeURIComponent(threadId)}/stream`;

  // Detect ReadableStream + fetch streaming support. Polyfill-free check.
  const supportsStreaming =
    typeof TextDecoder !== "undefined" &&
    typeof ReadableStream !== "undefined";

  if (!supportsStreaming) {
    return _pollingFallback(opts, threadId, handlers);
  }

  const controller = new AbortController();
  let stopped = false;

  const run = async () => {
    try {
      const f = _resolveFetch(opts);
      const resp = await f(url, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ..._authHeaders(opts),
        },
        signal: controller.signal,
      });
      if (!resp.ok) {
        handlers.onError?.(`stream HTTP ${resp.status}`);
        return;
      }
      if (!resp.body) {
        handlers.onError?.("no response body for stream");
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let currentEvent: string | null = null;
      let currentData: string[] = [];

      const flushEvent = () => {
        if (currentEvent === null && currentData.length === 0) return;
        const event = currentEvent ?? "message";
        const data = currentData.join("\n");
        currentEvent = null;
        currentData = [];

        if (event === "ready") {
          handlers.onReady?.();
          return;
        }
        if (event === "message") {
          try {
            const msg = JSON.parse(data) as Message;
            handlers.onMessage?.(msg);
          } catch (err) {
            handlers.onError?.(`bad message JSON: ${String(err)}`);
          }
          return;
        }
        if (event === "state") {
          try {
            const state = JSON.parse(data) as {
              thread_status: ThreadStatus | null;
              workflow_state: WorkflowState | null;
            };
            handlers.onState?.(state);
          } catch (err) {
            handlers.onError?.(`bad state JSON: ${String(err)}`);
          }
          return;
        }
        if (event === "error") {
          try {
            const e = JSON.parse(data) as { error: string };
            handlers.onError?.(e.error);
          } catch {
            handlers.onError?.(data);
          }
          return;
        }
      };

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames terminate with blank line (\n\n). Parse line-by-line.
        let nlIdx: number;
        // eslint-disable-next-line no-cond-assign
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlIdx).replace(/\r$/, "");
          buffer = buffer.slice(nlIdx + 1);

          if (line === "") {
            flushEvent();
            continue;
          }
          if (line.startsWith(":")) continue; // SSE comment
          if (line.startsWith("event:")) {
            currentEvent = line.slice("event:".length).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            currentData.push(line.slice("data:".length).trim());
            continue;
          }
          // Unknown line — ignore per SSE spec.
        }
      }
    } catch (err) {
      if (!stopped) {
        handlers.onError?.(`stream error: ${String(err)}`);
      }
    }
  };

  void run();

  return {
    close: () => {
      stopped = true;
      controller.abort();
    },
  };
}

function _pollingFallback(
  opts: RuntimeRequestOpts,
  threadId: string,
  handlers: StreamHandlers,
): StreamSubscription {
  let stopped = false;
  let lastTimestamp: string | null = null;
  let lastStatus: ThreadStatus | null = null;
  let lastWorkflowState: WorkflowState | null = null;

  const pollIntervalMs = 2000;

  const tick = async () => {
    if (stopped) return;
    try {
      const messages = await listMessages(opts, threadId, { limit: 50 });
      for (const m of messages) {
        if (lastTimestamp === null || (m.created_at ?? "") > lastTimestamp) {
          handlers.onMessage?.(m);
          lastTimestamp = m.created_at;
        }
      }
      const detail = await getThread(opts, threadId);
      if (detail.status !== lastStatus || detail.workflow_state !== lastWorkflowState) {
        handlers.onState?.({
          thread_status: detail.status,
          workflow_state: detail.workflow_state,
        });
        lastStatus = detail.status;
        lastWorkflowState = detail.workflow_state;
      }
    } catch (err) {
      handlers.onError?.(`polling error: ${String(err)}`);
    }
    if (!stopped) setTimeout(tick, pollIntervalMs);
  };

  setTimeout(() => {
    handlers.onReady?.();
    void tick();
  }, 0);

  return {
    close: () => {
      stopped = true;
    },
  };
}
