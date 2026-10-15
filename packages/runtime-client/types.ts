/**
 * Typed shapes for the portfolio-runtime conversation surface (Phase 2a).
 *
 * Mirrors the runtime_conversation_threads + runtime_conversation_messages
 * schema in migration 193. Keep in sync with
 * services/portfolio-runtime/conversation/api.py response shapes.
 */

export type ThreadStatus = "open" | "paused" | "closed" | "escalated";

export type MessageRole = "user" | "agent" | "system" | "tool";

export type WorkflowState =
  | "idle_cold"
  | "idle_warm"
  | "perceiving"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "reflecting"
  | "paused"
  | "escalated"
  | "failed";

export interface Thread {
  readonly id: string;
  readonly company_id: string;
  readonly workflow_id: string | null;
  readonly title: string | null;
  readonly status: ThreadStatus;
  readonly created_at: string | null; // RFC3339
  readonly last_message_at: string | null; // RFC3339
}

export interface ThreadDetail extends Thread {
  readonly message_count: number;
  readonly workflow_state: WorkflowState | null;
}

export interface MessageAttachment {
  readonly type?: string;
  readonly url?: string;
  readonly name?: string;
  readonly mime?: string;
  readonly size_bytes?: number;
  readonly [key: string]: unknown;
}

export interface Message {
  readonly id: string;
  readonly thread_id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly attachments: readonly MessageAttachment[];
  readonly created_at: string | null; // RFC3339
}

export interface SendMessageInput {
  readonly content: string;
  readonly attachments?: readonly MessageAttachment[];
}

export interface ListMessagesOptions {
  readonly limit?: number;
  readonly before?: string; // RFC3339 cursor
}

export interface RuntimeRequestOpts {
  /** Base URL of the portfolio-runtime container, e.g. https://runtime.example.com */
  readonly baseUrl: string;
  /** Company slug used in URL paths */
  readonly companySlug: string;
  /** Bearer token issued at provisioning time (companies.runtime_auth_token) */
  readonly authToken: string;
  /** Optional fetch override for SSR or tests */
  readonly fetchImpl?: typeof fetch;
}

export interface RuntimeHealth {
  readonly status: "ok" | "degraded" | "down";
  readonly version?: string;
}

/**
 * Stream events delivered via Server-Sent Events.
 */
export type StreamEvent =
  | { readonly kind: "ready" }
  | { readonly kind: "message"; readonly message: Message }
  | {
      readonly kind: "state";
      readonly thread_status: ThreadStatus | null;
      readonly workflow_state: WorkflowState | null;
    }
  | { readonly kind: "error"; readonly error: string };

export interface StreamHandlers {
  readonly onReady?: () => void;
  readonly onMessage?: (message: Message) => void;
  readonly onState?: (state: {
    thread_status: ThreadStatus | null;
    workflow_state: WorkflowState | null;
  }) => void;
  readonly onError?: (error: string) => void;
}

export interface StreamSubscription {
  readonly close: () => void;
}

/**
 * Error shape thrown by runtime-client when an HTTP request fails. Status
 * code carried so callers can distinguish 401 (re-auth) / 403 (cross-tenant)
 * / 404 (gone) / 5xx (transient) without parsing the message.
 */
export class RuntimeClientError extends Error {
  public readonly status: number;
  public readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `runtime-client HTTP ${status}: ${body}`);
    this.name = "RuntimeClientError";
    this.status = status;
    this.body = body;
  }
}
