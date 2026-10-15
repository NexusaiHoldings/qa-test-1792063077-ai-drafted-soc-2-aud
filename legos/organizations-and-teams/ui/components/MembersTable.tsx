"use client";
import React, { useEffect, useState } from "react";

/**
 * MembersTable — org members management (slot: members_table). Read-display;
 * role changes route through the change_member_role agent tool (confirm-gated)
 * or an admin action wired by the consuming page.
 */
interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_active_at?: string;
}
interface MembersTableProps {
  apiBase?: string;
  orgId: string;
}

const ROLE_COLOR: Record<string, string> = {
  owner: "#7c3aed", admin: "#2563eb", member: "#16a34a", viewer: "#6b7280",
};

export function MembersTable({ apiBase = "", orgId }: MembersTableProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`${apiBase}/api/orgs/${encodeURIComponent(orgId)}/members`);
      if (active && res.ok) {
        const d = await res.json();
        setMembers(d.members ?? []);
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [apiBase, orgId]);

  if (loading) return <p>Loading members…</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
          <th style={{ padding: 8 }}>Member</th>
          <th style={{ padding: 8 }}>Role</th>
          <th style={{ padding: 8 }}>Joined</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
            <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{m.user_id.slice(0, 8)}</td>
            <td style={{ padding: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: ROLE_COLOR[m.role] ?? "#6b7280", borderRadius: 999, padding: "2px 10px" }}>
                {m.role}
              </span>
            </td>
            <td style={{ padding: 8, fontSize: 13, opacity: 0.7 }}>{new Date(m.joined_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
