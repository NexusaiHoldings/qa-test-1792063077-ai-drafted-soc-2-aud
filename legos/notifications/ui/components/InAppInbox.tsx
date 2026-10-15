"use client";
/* In-app notification inbox — fetches from /api/notifications/inbox + mark-read. */
import React, { useEffect, useState } from "react";

interface InboxItem {
  id: string;
  template_name: string;
  category: string;
  subject: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

interface InAppInboxProps {
  /** Slot — extra per-row action buttons. */
  slotInAppInboxExtraActions?: (item: InboxItem) => React.ReactNode;
}

export function InAppInbox({ slotInAppInboxExtraActions }: InAppInboxProps) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    const resp = await fetch("/api/notifications/inbox");
    if (!resp.ok) { setLoading(false); return; }
    const d = await resp.json();
    setItems(d.items || []);
    setUnreadCount(d.unread_count || 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/inbox/${id}/read`, { method: "POST" });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, is_read: true } : i));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  if (loading) return <div className="inbox loading">Loading...</div>;
  if (items.length === 0) return <div className="inbox empty">No notifications yet.</div>;

  return (
    <div className="inbox">
      <h3>Inbox {unreadCount > 0 && <span className="badge">{unreadCount}</span>}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.is_read ? "read" : "unread"}>
            <div className="subject">{item.subject || item.template_name}</div>
            <div className="meta">
              <span className="category">{item.category}</span>
              <span className="time">{new Date(item.created_at).toLocaleString()}</span>
            </div>
            {item.body && (
              <div className="body" dangerouslySetInnerHTML={{ __html: item.body }} />
            )}
            <div className="actions">
              {!item.is_read && (
                <button type="button" onClick={() => markRead(item.id)}>Mark Read</button>
              )}
              {slotInAppInboxExtraActions?.(item)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
