"use client";

/**
 * MessageBubble — single message in a thread. Variants by role.
 *
 * Phase 2c (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23).
 */

import type { JSX } from "react";
import type { Message } from "@nexus-substrate/runtime-client";

export function MessageBubble({ message }: { message: Message }): JSX.Element {
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const isSystem = message.role === "system";

  const alignment: React.CSSProperties = {
    display: "flex",
    flexDirection: isUser ? "row-reverse" : "row",
    marginBottom: "0.75rem",
  };

  const bubble: React.CSSProperties = {
    maxWidth: "72%",
    padding: "0.6rem 0.9rem",
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: isUser
      ? "rgba(59, 130, 246, 0.12)"
      : isAgent
      ? "rgba(0, 0, 0, 0.04)"
      : "transparent",
    border: isSystem ? "1px dashed rgba(0,0,0,0.15)" : "none",
    color: isSystem ? "rgba(0, 0, 0, 0.5)" : "inherit",
    fontStyle: isSystem ? "italic" : "normal",
  };

  const meta: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.55,
    marginTop: 4,
  };

  const created = message.created_at
    ? new Date(message.created_at).toLocaleTimeString()
    : "";

  return (
    <div style={alignment}>
      <div>
        <div style={bubble}>{message.content}</div>
        <div style={meta}>
          {isUser ? "You" : isAgent ? "Agent" : message.role} · {created}
        </div>
      </div>
    </div>
  );
}
