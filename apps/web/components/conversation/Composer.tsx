"use client";

/**
 * Composer — text input + send button. Submits on Enter (Shift+Enter for newline).
 *
 * Phase 2c (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23).
 */

import { useState, type JSX, type KeyboardEvent } from "react";

export function Composer({
  onSend,
  disabled,
}: {
  readonly onSend: (content: string) => Promise<void> | void;
  readonly disabled?: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Message your operator…"
        disabled={disabled || sending}
        rows={2}
        style={{
          flex: 1,
          padding: "0.6rem 0.8rem",
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.15)",
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          minHeight: 44,
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!draft.trim() || sending || disabled}
        style={{
          padding: "0.6rem 1.2rem",
          borderRadius: 8,
          border: "none",
          background: !draft.trim() || sending || disabled ? "rgba(0,0,0,0.1)" : "#3b82f6",
          color: !draft.trim() || sending || disabled ? "rgba(0,0,0,0.4)" : "#fff",
          fontWeight: 600,
          cursor: !draft.trim() || sending || disabled ? "not-allowed" : "pointer",
        }}
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
