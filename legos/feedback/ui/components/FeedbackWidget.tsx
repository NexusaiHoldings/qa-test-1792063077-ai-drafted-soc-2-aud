"use client";
import React, { FormEvent, useState } from "react";

/**
 * FeedbackWidget — the in-app feedback FAB (slot: feedback_widget_launcher).
 *
 * A floating button mounted in the app layout. Opens a small composer: pick a
 * type (bug / edit / idea), write a description, submit. POSTs to the substrate
 * /api/feedback route which records it in the company DB and forwards
 * `feedback.submitted` to Nexus for triage. user attribution is resolved
 * server-side from the session, so this works without props.
 *
 * Rendered only for signed-in users (the layout gates on the session); it
 * self-hides if the submit comes back 401.
 */

interface FeedbackWidgetProps {
  apiBase?: string;
}

const TYPES: Array<{ value: "bug" | "edit" | "idea"; label: string }> = [
  { value: "idea", label: "💡 Idea" },
  { value: "edit", label: "✏️ Change" },
  { value: "bug", label: "🐞 Bug" },
];

export function FeedbackWidget({ apiBase = "" }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"bug" | "edit" | "idea">("idea");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The page the user was on when they CLICKED Feedback — client-side nav can
  // change location between open and submit, and the click is what they meant.
  const [pageAtOpen, setPageAtOpen] = useState<string | null>(null);

  function currentPage(): string | null {
    if (typeof window === "undefined") return null;
    return window.location.pathname + window.location.search;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Tell us a little about it first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const page = pageAtOpen ?? currentPage();
      const res = await fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, description, page }),
      });
      if (res.ok) {
        setDone(true);
        setDescription("");
      } else if (res.status === 401) {
        // Not signed in — quietly close.
        setOpen(false);
      } else {
        setError((await res.text()) || "Could not send feedback.");
      }
    } catch {
      setError("Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setPageAtOpen(currentPage());
        }}
        aria-label="Send feedback"
        style={{
          position: "fixed", bottom: 24, right: 96, zIndex: 60,
          borderRadius: 999, padding: "12px 18px",
          border: "1px solid var(--substrate-border, rgba(0,0,0,0.1))",
          background: "var(--substrate-surface, #fff)",
          color: "var(--substrate-fg, #111)",
          fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}
      >
        Feedback
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Send feedback"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 60, width: 340,
        maxWidth: "90vw", background: "#fff", color: "#111", borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.2)", padding: 16,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Send feedback</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18 }}
        >
          ×
        </button>
      </div>

      {done ? (
        <p style={{ marginTop: 12 }}>
          Thanks — we got it. We review every note and ship the good ones.
          <br />
          <button
            type="button"
            onClick={() => setDone(false)}
            style={{
              marginTop: 10, padding: "6px 12px", borderRadius: 6,
              border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13,
            }}
          >
            Send another
          </button>
        </p>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 7, fontSize: 13, cursor: "pointer",
                  border: type === t.value ? "1px solid var(--substrate-accent, #2563eb)" : "1px solid #ddd",
                  background: type === t.value ? "var(--substrate-accent, #2563eb)" : "#fff",
                  color: type === t.value ? "#fff" : "#333", fontWeight: 600,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's on your mind? Bug, change, or idea — we'll triage it."
            rows={4}
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", boxSizing: "border-box" }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 8, width: "100%", padding: 10, borderRadius: 6, border: "none",
              background: "var(--substrate-accent, #2563eb)", color: "#fff",
              fontWeight: 600, cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </form>
      )}
      {error && <p style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </div>
  );
}
