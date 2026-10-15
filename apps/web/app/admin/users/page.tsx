/**
 * /admin/users — Users admin (admin-users-001).
 *
 * The #1 "manually administer the company" capability: list users, see status +
 * activity, and disable / reactivate accounts. Reads /api/admin/users and PATCHes
 * /api/admin/users/[id]. Self-contained, first-class styling for the AdminShell
 * light content area (the admin console isn't theme-tokened).
 */
"use client";

import { useCallback, useEffect, useState } from "react";

interface UserRow {
  id: string;
  email: string;
  status: string;
  created_at: string | null;
  last_login_at: string | null;
}

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)", padding: 0, overflow: "hidden",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: 12, fontWeight: 600,
  color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em",
  borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
};
const td: React.CSSProperties = {
  padding: "12px 16px", fontSize: 14, color: "#0f172a", borderBottom: "1px solid #f1f5f9",
};

function pill(status: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    active: ["#dcfce7", "#166534"],
    disabled: ["#fee2e2", "#991b1b"],
    deleted: ["#f1f5f9", "#475569"],
  };
  const [bg, fg] = map[status] || ["#f1f5f9", "#475569"];
  return { background: bg, color: fg, fontSize: 12, fontWeight: 600,
    padding: "2px 10px", borderRadius: 999, textTransform: "capitalize" };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

export default function UsersAdminPage(): JSX.Element {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      const d = await r.json();
      setUsers(d.users || []);
      setErr(d.error || null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Users</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          Everyone with an account on this company. Disable an account to revoke access immediately.
        </p>
      </div>

      {err && (
        <div style={{ ...card, padding: 16, marginBottom: 16, color: "#991b1b", background: "#fef2f2", borderColor: "#fecaca" }}>
          Couldn’t load users: {err}
        </div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Status</th>
              <th style={th}>Joined</th>
              <th style={th}>Last login</th>
              <th style={{ ...th, textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={td} colSpan={5}>Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td style={{ ...td, color: "#64748b" }} colSpan={5}>No users yet.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.email}</td>
                  <td style={td}><span style={pill(u.status)}>{u.status}</span></td>
                  <td style={{ ...td, color: "#64748b" }}>{fmt(u.created_at)}</td>
                  <td style={{ ...td, color: "#64748b" }}>{fmt(u.last_login_at)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {u.status === "active" ? (
                      <button disabled={busy === u.id} onClick={() => setStatus(u.id, "disabled")}
                        style={{ fontSize: 13, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                          border: "1px solid #fecaca", background: "#fff", color: "#b91c1c" }}>
                        {busy === u.id ? "…" : "Disable"}
                      </button>
                    ) : u.status === "disabled" ? (
                      <button disabled={busy === u.id} onClick={() => setStatus(u.id, "active")}
                        style={{ fontSize: 13, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                          border: "1px solid #bbf7d0", background: "#fff", color: "#15803d" }}>
                        {busy === u.id ? "…" : "Reactivate"}
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
