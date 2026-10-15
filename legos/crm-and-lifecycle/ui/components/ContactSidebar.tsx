"use client";
import React, { useEffect, useState } from "react";

/**
 * ContactSidebar — contact detail + the agent's proposed next action
 * (slot: contact_sidebar). The nextAction is supplied by the runtime's
 * propose_next_action tool; the salesperson acts on it.
 */
interface Contact {
  id: string;
  name: string;
  email?: string;
  company?: string;
  stage: string;
  lead_score: number;
  is_hot: boolean;
}
interface NextAction {
  action: string;
  rationale?: string;
  urgency?: string;
}
interface ContactSidebarProps {
  apiBase?: string;
  contactId: string;
  nextAction?: NextAction;
}

const URGENCY_COLOR: Record<string, string> = { high: "#b91c1c", medium: "#d97706", low: "#16a34a" };

export function ContactSidebar({ apiBase = "", contactId, nextAction }: ContactSidebarProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/crm/contacts/${encodeURIComponent(contactId)}`);
        if (active && res.ok) {
          const d = await res.json();
          setContact(d.contact);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [apiBase, contactId]);

  if (loading) return <aside>Loading…</aside>;
  if (!contact) return <aside style={{ opacity: 0.6 }}>Contact not found.</aside>;

  return (
    <aside style={{ width: 300, padding: 16, borderLeft: "1px solid #eee", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 16 }}>{contact.name}</strong>
        {contact.is_hot && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#b91c1c", borderRadius: 999, padding: "2px 8px" }}>HOT</span>
        )}
      </div>
      <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{contact.company ?? ""}</div>
      <div style={{ marginTop: 10, fontSize: 13 }}>
        Stage: <strong>{contact.stage}</strong> · Score: <strong>{contact.lead_score}</strong>
      </div>
      {nextAction && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", opacity: 0.6 }}>
            Agent suggests
            {nextAction.urgency && (
              <span style={{ marginLeft: 6, color: URGENCY_COLOR[nextAction.urgency] ?? "#6b7280" }}>
                ● {nextAction.urgency}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{nextAction.action}</div>
          {nextAction.rationale && (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{nextAction.rationale}</div>
          )}
        </div>
      )}
    </aside>
  );
}
