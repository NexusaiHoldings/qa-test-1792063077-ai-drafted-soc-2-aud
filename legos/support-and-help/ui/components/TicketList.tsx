"use client";
import React, { useEffect, useState } from "react";

/**
 * TicketList — a user's support ticket history. Renders read-only; clicking a
 * ticket can be wired to a detail view by the consuming page.
 */

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category?: string;
  assignee_type: string;
  created_at: string;
}

interface TicketListProps {
  apiBase?: string;
  userId: string;
  onSelect?: (ticketId: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  open: "#2563eb",
  pending: "#d97706",
  resolved: "#16a34a",
  closed: "#6b7280",
};

export function TicketList({ apiBase = "", userId, onSelect }: TicketListProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/support/tickets?user_id=${encodeURIComponent(userId)}`,
        );
        if (!active) return;
        if (res.ok) {
          const d = await res.json();
          setTickets(d.tickets ?? []);
        } else {
          setError("Could not load your tickets.");
        }
      } catch {
        if (active) setError("Could not load your tickets.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiBase, userId]);

  if (loading) return <p>Loading tickets…</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (tickets.length === 0) return <p style={{ opacity: 0.6 }}>No support tickets yet.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {tickets.map((t) => (
        <li
          key={t.id}
          onClick={() => onSelect?.(t.id)}
          style={{
            padding: "12px 14px", borderBottom: "1px solid #eee",
            cursor: onSelect ? "pointer" : "default", display: "flex",
            justifyContent: "space-between", alignItems: "center", gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{t.subject}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {t.category ?? "general"} · {new Date(t.created_at).toLocaleDateString()}
            </div>
          </div>
          <span
            style={{
              fontSize: 12, fontWeight: 600, color: "#fff", borderRadius: 999,
              padding: "2px 10px", background: STATUS_COLOR[t.status] ?? "#6b7280",
            }}
          >
            {t.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
