"use client";
import React, { useEffect, useState } from "react";

interface Session {
  id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_used_at: string;
}

interface SessionsListProps {
  sessionToken: string;
  apiBase?: string;
  onRevoke?: (sessionId: string) => void;
}

export function SessionsList({ sessionToken, apiBase = "", onRevoke }: SessionsListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/account/sessions`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) { setError("Failed to load sessions"); return; }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [sessionToken]);

  async function handleRevoke(sessionId: string) {
    setRevoking(sessionId);
    try {
      const res = await fetch(`${apiBase}/api/auth/account/sessions/${sessionId}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        onRevoke?.(sessionId);
      } else {
        setError("Failed to revoke session");
      }
    } catch { setError("Network error"); }
    finally { setRevoking(null); }
  }

  if (loading) return <p aria-live="polite">Loading sessions…</p>;
  if (error) return <p role="alert" style={{ color: "red" }}>{error}</p>;
  if (sessions.length === 0) return <p>No active sessions.</p>;

  return (
    <table aria-label="Active sessions">
      <thead>
        <tr>
          <th>IP Address</th><th>Device</th><th>Started</th><th>Action</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => (
          <tr key={s.id}>
            <td>{s.ip_address || "—"}</td>
            <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.user_agent || "—"}
            </td>
            <td>{new Date(s.created_at).toLocaleDateString()}</td>
            <td>
              <button
                onClick={() => handleRevoke(s.id)}
                disabled={revoking === s.id}
                aria-busy={revoking === s.id}
              >
                {revoking === s.id ? "Revoking…" : "Revoke"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
