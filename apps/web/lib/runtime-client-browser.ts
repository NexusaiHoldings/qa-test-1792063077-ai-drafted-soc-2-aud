/**
 * Browser-facing runtime client — talks to the local Next.js API proxy at
 * /api/runtime/*. The bearer token NEVER leaves the server; the proxy
 * routes (apps/web/app/api/runtime/) attach it server-side before forwarding
 * to portfolio-runtime.
 *
 * Phase 2c (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23).
 *
 * Type shapes are imported from @nexus-substrate/runtime-client so the
 * browser-side and server-side surfaces stay in lockstep.
 */

import type {
  Thread,
  ThreadDetail,
  Message,
  SendMessageInput,
  ListMessagesOptions,
  StreamHandlers,
  StreamSubscription,
  ThreadStatus,
  WorkflowState,
} from "@nexus-substrate/runtime-client";

import { RuntimeClientError } from "@nexus-substrate/runtime-client";

async function _proxyRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const resp = await fetch(`/api/runtime${path}`, {
    method,
    headers,
    body: payload,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new RuntimeClientError(resp.status, text);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export async function listThreads(limit?: number): Promise<Thread[]> {
  const qp = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return _proxyRequest<Thread[]>("GET", `/threads${qp}`);
}

export async function createThread(body?: { title?: string }): Promise<Thread> {
  return _proxyRequest<Thread>("POST", `/threads`, body ?? {});
}

export async function getThread(threadId: string): Promise<ThreadDetail> {
  return _proxyRequest<ThreadDetail>("GET", `/threads/${encodeURIComponent(threadId)}`);
}

export async function listMessages(
  threadId: string,
  pageOpts?: ListMessagesOptions,
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (pageOpts?.limit !== undefined) params.set("limit", String(pageOpts.limit));
  if (pageOpts?.before) params.set("before", pageOpts.before);
  const qp = params.toString();
  return _proxyRequest<Message[]>(
    "GET",
    `/threads/${encodeURIComponent(threadId)}/messages${qp ? `?${qp}` : ""}`,
  );
}

export async function sendMessage(
  threadId: string,
  body: SendMessageInput,
): Promise<Message> {
  return _proxyRequest<Message>(
    "POST",
    `/threads/${encodeURIComponent(threadId)}/messages`,
    body,
  );
}

/**
 * Subscribe to a thread's live updates via the local SSE proxy.
 * The proxy forwards events from portfolio-runtime's SSE stream;
 * client-side parsing is identical to the runtime-client package's
 * subscribeToThread (fetch + ReadableStream + manual SSE).
 */
export function subscribeToThread(
  threadId: string,
  handlers: StreamHandlers,
): StreamSubscription {
  const url = `/api/runtime/threads/${encodeURIComponent(threadId)}/stream`;

  const supportsStreaming =
    typeof TextDecoder !== "undefined" &&
    typeof ReadableStream !== "undefined";

  // 2026-05-25: SSE proxy on Vercel hangs (function fails to return even
  // headers within 30s — verified via curl). Source-level
  // `export const runtime = "edge"` in the route handler didn't take
  // effect — Vercel still builds it as nodejs24.x lambda which buffers
  // responses to memory until upstream stream closes (10min SSE_MAX_DURATION).
  // Root cause unknown; suspect build cache or runtime auto-detection bug
  // in this Next.js 14.2 + npm@10.9.0 + turbo 2.0 + monorepo configuration.
  // Pragmatic fallback: force polling for all clients. 2-second cadence is
  // close enough to realtime for human chat UX. SSE re-enable + Edge runtime
  // fix is a follow-up sprint (`sse-edge-runtime-investigation-001`).
  const FORCE_POLLING_FALLBACK = true;
  if (FORCE_POLLING_FALLBACK || !supportsStreaming) {
    return _pollingFallback(threadId, handlers);
  }

  const controller = new AbortController();
  let stopped = false;

  const run = async () => {
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
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
        let nlIdx: number;
        // eslint-disable-next-line no-cond-assign
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlIdx).replace(/\r$/, "");
          buffer = buffer.slice(nlIdx + 1);
          if (line === "") {
            flushEvent();
            continue;
          }
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) {
            currentEvent = line.slice("event:".length).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            currentData.push(line.slice("data:".length).trim());
            continue;
          }
        }
      }
    } catch (err) {
      if (!stopped) handlers.onError?.(`stream error: ${String(err)}`);
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
  threadId: string,
  handlers: StreamHandlers,
): StreamSubscription {
  let stopped = false;
  let lastTimestamp: string | null = null;
  let lastStatus: ThreadStatus | null = null;
  let lastWorkflowState: WorkflowState | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const messages = await listMessages(threadId, { limit: 50 });
      for (const m of messages) {
        if (lastTimestamp === null || (m.created_at ?? "") > lastTimestamp) {
          handlers.onMessage?.(m);
          lastTimestamp = m.created_at;
        }
      }
      const detail = await getThread(threadId);
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
    if (!stopped) setTimeout(tick, 2000);
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
