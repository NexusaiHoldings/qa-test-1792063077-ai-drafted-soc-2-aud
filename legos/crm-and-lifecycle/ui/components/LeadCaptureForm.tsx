"use client";
import React, { FormEvent, useState } from "react";

/**
 * LeadCaptureForm — embeddable lead-capture form (slot: lead_capture_form).
 * Posts to /api/crm/leads; the agent triages + scores on arrival.
 */
interface LeadCaptureFormProps {
  apiBase?: string;
  source?: string;
  onCaptured?: (contactId: string) => void;
}

export function LeadCaptureForm({ apiBase = "", source = "lead_form", onCaptured }: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    setError(null); setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/crm/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, source }),
      });
      if (res.ok) {
        const d = await res.json();
        setDone(true);
        onCaptured?.(d.contact_id);
      } else {
        setError(await res.text());
      }
    } catch {
      setError("Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <p>Thanks — we&apos;ll be in touch shortly.</p>;

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
        style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
        style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
      <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company"
        style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
      <button type="submit" disabled={submitting}
        style={{ padding: 10, borderRadius: 6, border: "none", background: "var(--substrate-accent, #2563eb)", color: "#fff", fontWeight: 600 }}>
        {submitting ? "Submitting…" : "Get in touch"}
      </button>
      {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
    </form>
  );
}
