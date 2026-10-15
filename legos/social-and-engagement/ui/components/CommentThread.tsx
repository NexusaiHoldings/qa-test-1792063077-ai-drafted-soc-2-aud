"use client";
import React, { FormEvent, useEffect, useState } from "react";

/** CommentThread — comments for an entity (slot: comment_thread). */
interface CommentThreadProps { apiBase?: string; entityType: string; entityId: string; userId?: string; }
interface Comment { id: string; author_id?: string; body: string; created_at: string; }

export function CommentThread({ apiBase = "", entityType, entityId, userId }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");

  async function refresh() {
    const res = await fetch(`${apiBase}/api/social/comments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
    if (res.ok) { const d = await res.json(); setComments(d.comments ?? []); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [apiBase, entityType, entityId]);

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await fetch(`${apiBase}/api/social/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, author_id: userId, body: text }),
    });
    if (res.ok) { setText(""); refresh(); }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {comments.map((c) => (
          <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{c.author_id ? c.author_id.slice(0, 8) : "anon"} · {new Date(c.created_at).toLocaleDateString()}</div>
            <div>{c.body}</div>
          </li>
        ))}
        {comments.length === 0 && <li style={{ opacity: 0.6, padding: 8 }}>No comments yet.</li>}
      </ul>
      {userId && (
        <form onSubmit={post} style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…"
            style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
          <button type="submit" style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--substrate-accent, #2563eb)", color: "#fff", fontWeight: 600 }}>Post</button>
        </form>
      )}
    </div>
  );
}
