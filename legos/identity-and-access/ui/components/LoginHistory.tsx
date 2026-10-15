"use client";
import React, { useEffect, useState } from "react";

interface HistoryEntry {
  id: string;
  login_at: string;
  ip_address: string;
  user_agent: string;
  method: string;
  success: boolean;
  failure_reason: string;
}

interface LoginHistoryProps {
  sessionToken: string;
  apiBase?: string;
}

export function LoginHistory({ sessionToken, apiBase = "" }: LoginHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/api/auth/account/login-history`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setHistory(d.history ?? []))
      .catch(() => setError("Failed to load login history"))
      .finally(() => setLoading(false));
  }, [sessionToken]);

  if (loading) return <p aria-live="polite">Loading history…</p>;
  if (error) return <p role="alert" style={{ color: "red" }}>{error}</p>;
  if (history.length === 0) return <p>No login history.</p>;

  return (
    <table aria-label="Login history">
      <thead>
        <tr>
          <th>Date</th><th>Method</th><th>IP</th><th>Result</th>
        </tr>
      </thead>
      <tbody>
        {history.map(h => (
          <tr key={h.id}>
            <td>{new Date(h.login_at).toLocaleString()}</td>
            <td>{h.method || "—"}</td>
            <td>{h.ip_address || "—"}</td>
            <td style={{ color: h.success ? "green" : "red" }}>
              {h.success ? "Success" : `Failed${h.failure_reason ? `: ${h.failure_reason}` : ""}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
