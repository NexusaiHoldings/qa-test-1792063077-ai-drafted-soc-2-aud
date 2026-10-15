"use client";
import React, { useEffect, useState } from "react";
import { AdminPageTemplate } from "./AdminPageTemplate";
import { AdminTable, ColumnDef } from "./AdminTable";

interface FeatureFlag { id: string; key: string; enabled: boolean; description: string; rollout_percent: number; target_segments: unknown[]; }
function tok() { return typeof window !== "undefined" ? (window as any).__ADMIN_TOKEN__ || "" : ""; }
function api(url: string, opts?: RequestInit) { return fetch(url, { ...opts, headers: { "Content-Type": "application/json", "X-Admin-Token": tok(), ...(opts?.headers || {}) } }); }

export function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState(""); const [newDesc, setNewDesc] = useState("");

  function load() { setLoading(true); api("/api/admin/flags").then(r => r.json()).then(d => { setFlags(d.flags || []); setLoading(false); }).catch(e => { setError(String(e)); setLoading(false); }); }
  useEffect(load, []);

  async function toggle(f: FeatureFlag) { await api(`/api/admin/flags/${f.key}`, { method: "PATCH", body: JSON.stringify({ enabled: !f.enabled }) }); load(); }
  async function setRollout(f: FeatureFlag, p: number) { await api(`/api/admin/flags/${f.key}`, { method: "PATCH", body: JSON.stringify({ rollout_percent: p }) }); load(); }
  async function create() { if (!newKey.trim()) return; await api("/api/admin/flags", { method: "POST", body: JSON.stringify({ key: newKey.trim(), description: newDesc }) }); setShowNew(false); setNewKey(""); setNewDesc(""); load(); }

  const columns: ColumnDef<FeatureFlag>[] = [
    { key: "key", header: "Flag Key", sortable: true },
    { key: "description", header: "Description" },
    { key: "enabled", header: "Enabled", render: (_, r) => <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} style={{ cursor: "pointer" }} /> },
    { key: "rollout_percent", header: "Rollout", render: (_, r) => <input type="range" min={0} max={100} value={r.rollout_percent} onChange={e => setRollout(r, +e.target.value)} style={{ width: 100 }} /> },
    { key: "rollout_percent", header: "%", render: v => `${v}%` },
  ];

  return (
    <AdminPageTemplate title="Feature Flags" breadcrumbs={[{ label: "Admin" }, { label: "Feature Flags" }]}
      actionButton={<button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>+ New flag</button>}>
      {showNew && (
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", background: "#f0f9ff", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="flag-key" style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 14, width: 200 }} />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 14, width: 260 }} />
          <button onClick={create} style={{ padding: "6px 14px", background: "#15803d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>Create</button>
          <button onClick={() => setShowNew(false)} style={{ padding: "6px 10px", background: "#f1f5f9", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>Cancel</button>
        </div>
      )}
      <AdminTable columns={columns} rows={flags} loading={loading} error={error} emptyMessage="No feature flags defined." />
    </AdminPageTemplate>
  );
}
