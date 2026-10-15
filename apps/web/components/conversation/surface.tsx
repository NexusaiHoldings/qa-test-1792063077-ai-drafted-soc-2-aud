"use client";

/**
 * ConversationSurface — primary user-facing surface of every portfolio company.
 *
 * Spec §6.1: "The window the agent is already running, the user nudges
 * through it." This component owns the conversation state machine: thread
 * list, active thread, message timeline, live updates via SSE, composer
 * input. All HTTP calls go through /api/runtime/* proxy routes (token
 * never reaches the browser — ADR 0025).
 *
 * Phase 2c (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23).
 *
 * Props are intentionally minimal: `companyName` for the header. The
 * companySlug + auth token live server-side; the browser uses relative
 * /api/runtime/* URLs.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type {
  Message,
  Thread,
  ThreadStatus,
  WorkflowState,
} from "@nexus-substrate/runtime-client";
import {
  listThreads as listThreadsBrowser,
  createThread as createThreadBrowser,
  listMessages as listMessagesBrowser,
  sendMessage as sendMessageBrowser,
  subscribeToThread,
} from "@/lib/runtime-client-browser";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { ThreadList } from "./ThreadList";

export interface ConversationSurfaceProps {
  readonly companyName: string;
}

export function ConversationSurface({
  companyName,
}: ConversationSurfaceProps): JSX.Element {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const subscriptionRef = useRef<{ close: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ── Bootstrap: load threads, pick the most recent or create one ────────────
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const fetched = await listThreadsBrowser(50);
        if (cancelled) return;
        if (fetched.length === 0) {
          const fresh = await createThreadBrowser();
          if (cancelled) return;
          setThreads([fresh]);
          setActiveThreadId(fresh.id);
        } else {
          setThreads(fetched);
          setActiveThreadId(fetched[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to load conversations: ${String(err)}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load messages + subscribe to live updates whenever active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const initial = await listMessagesBrowser(activeThreadId, { limit: 200 });
        if (cancelled) return;
        setMessages(initial);
      } catch (err) {
        if (!cancelled) setError(`Failed to load messages: ${String(err)}`);
      }
    };
    void load();

    // Tear down any previous subscription before opening a new one.
    subscriptionRef.current?.close();
    subscriptionRef.current = subscribeToThread(activeThreadId, {
      onReady: () => setError(null),
      onMessage: (m) => {
        // Skip duplicates if we already have this id (initial load + stream
        // can deliver overlap on race conditions).
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m],
        );
      },
      onState: ({ thread_status, workflow_state }) => {
        setThreadStatus(thread_status);
        setWorkflowState(workflow_state);
      },
      onError: (err) => setError(err),
    });

    return () => {
      cancelled = true;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [activeThreadId]);

  // ── Auto-scroll on new messages ────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeThreadId) return;
      try {
        const created = await sendMessageBrowser(activeThreadId, { content });
        setMessages((prev) =>
          prev.some((x) => x.id === created.id) ? prev : [...prev, created],
        );
        setThreads((prev) => {
          const updated = prev.map((t) =>
            t.id === activeThreadId
              ? { ...t, last_message_at: new Date().toISOString() }
              : t,
          );
          updated.sort((a, b) => {
            const at = a.last_message_at ?? a.created_at ?? "";
            const bt = b.last_message_at ?? b.created_at ?? "";
            return bt.localeCompare(at);
          });
          return updated;
        });
      } catch (err) {
        setError(`Failed to send: ${String(err)}`);
      }
    },
    [activeThreadId],
  );

  const handleNewThread = useCallback(async () => {
    try {
      const fresh = await createThreadBrowser();
      setThreads((prev) => [fresh, ...prev]);
      setActiveThreadId(fresh.id);
      setMessages([]);
    } catch (err) {
      setError(`Failed to create thread: ${String(err)}`);
    }
  }, []);

  return (
    <main
      style={{
        display: "flex",
        height: "100vh",
        maxHeight: "100vh",
        background: "#fff",
        color: "#111",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <ThreadList
        threads={threads}
        activeId={activeThreadId}
        onSelect={(id) => setActiveThreadId(id)}
        onNew={handleNewThread}
      />

      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <header
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{companyName}</h1>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
              {threadStatus ? `Thread: ${threadStatus}` : "Conversation surface"}
              {workflowState ? ` · Agent: ${workflowState}` : ""}
            </div>
          </div>
          {error && (
            <div
              role="alert"
              style={{
                fontSize: 12,
                color: "#b91c1c",
                background: "rgba(220,38,38,0.08)",
                padding: "0.35rem 0.6rem",
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}
        </header>

        <div
          role="region"
          aria-label="Conversation"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            background: "rgba(0,0,0,0.015)",
          }}
        >
          {loading ? (
            <div style={{ opacity: 0.5, fontSize: 14 }}>Loading conversation…</div>
          ) : messages.length === 0 ? (
            <div style={{ opacity: 0.55, fontSize: 14 }}>
              Your operator is online. Tell it what you need.
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <footer
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <Composer onSend={handleSend} disabled={!activeThreadId} />
        </footer>
      </section>
    </main>
  );
}
