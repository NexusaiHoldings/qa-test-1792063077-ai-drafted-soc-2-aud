"use client";
import React, { FormEvent, useState } from "react";

/**
 * SupportWidget — the in-app support surface (slot: support_widget_launcher).
 *
 * Two modes: a KB search that powers AI deflection (the agent answers from the
 * knowledge base before opening a ticket), and a new-ticket form. On submit it
 * POSTs to the substrate's /api/support routes which proxy to this lego's
 * handlers; the runtime agent then triages + drafts a first response.
 */

interface SupportWidgetProps {
  apiBase?: string;
  userId?: string;
}

interface KbCandidate {
  id: string;
  slug: string;
  title: string;
}

export function SupportWidget({ apiBase = "", userId }: SupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [candidates, setCandidates] = useState<KbCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function searchKb(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/support/kb/search?q=${encodeURIComponent(question)}`,
      );
      if (res.ok) {
        const d = await res.json();
        setCandidates((d.candidates ?? []).slice(0, 3));
      }
    } catch {
      setError("Could not search the help center.");
    }
  }

  async function openTicket(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/support/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, subject, message, email: email || undefined }),
      });
      if (res.ok) {
        const d = await res.json();
        setTicketId(d.ticket_id);
        setSubject("");
        setMessage("");
      } else {
        setError(await res.text());
      }
    } catch {
      setError("Could not open a ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open support"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 60,
          borderRadius: 999, padding: "12px 18px", border: "none",
          background: "var(--substrate-accent, #2563eb)", color: "#fff",
          fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        Help
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Support"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 60, width: 360,
        maxWidth: "90vw", background: "#fff", color: "#111", borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.2)", padding: 16,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Help &amp; Support</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {ticketId ? (
        <p style={{ marginTop: 12 }}>
          Thanks — your ticket is open. We&apos;ll reply shortly.
          <br />
          <span style={{ opacity: 0.6, fontSize: 12 }}>Ref: {ticketId.slice(0, 8)}</span>
        </p>
      ) : (
        <>
          <form onSubmit={searchKb} style={{ marginTop: 12 }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Search help articles…"
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd" }}
            />
          </form>
          {candidates.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 16 }}>
              {candidates.map((c) => (
                <li key={c.id}>
                  <a href={`${apiBase}/help/${c.slug}`}>{c.title}</a>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={openTicket} style={{ marginTop: 12 }}>
            {!userId && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (so we can reply)"
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", marginBottom: 8 }}
              />
            )}
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", marginBottom: 8 }}
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help?"
              rows={4}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd" }}
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
              {submitting ? "Sending…" : "Open a ticket"}
            </button>
          </form>
        </>
      )}
      {error && <p style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </div>
  );
}
