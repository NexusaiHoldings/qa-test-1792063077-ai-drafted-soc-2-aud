"use client";
import React, { useEffect, useState } from "react";
import { AdminPageTemplate } from "./AdminPageTemplate";
import { AdminTable, ColumnDef } from "./AdminTable";

interface ConfigEntry { key: string; value: unknown; updated_at: string; }
function tok() { return typeof window !== "undefined" ? (window as any).__ADMIN_TOKEN__ || "" : ""; }
function api(url: string, opts?: RequestInit) { return fetch(url, { ...opts, headers: { "Content-Type": "application/json", "X-Admin-Token": tok(), ...(opts?.headers || {}) } }); }

export function SystemConfigPage() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState(""); const [saveErr, setSaveErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState(""); const [newVal, setNewVal] = useState("");
  const [newErr, setNewErr] = useState<string | null>(null);

  function load() { setLoading(true); api("/api/admin/config").then(r => r.json()).then(d => { setEntries(d.config || []); setLoading(false); }).catch(e => { setError(String(e)); setLoading(false); }); }
  useEffect(load, []);

  async function save(key: string) {
    let parsed: unknown; try { parsed = JSON.parse(editVal); } catch { setSaveErr("Invalid JSON"); return; }
    const r = await api(`/api/admin/config/${key}`, { method: "PUT", body: JSON.stringify({ value: parsed }) });
    if (!r.ok) { setSaveErr(await r.text()); return; }
    setEditing(null); setSaveErr(null); load();
  }

  // The PUT shim upserts (ON CONFLICT (key) DO UPDATE), so creating a new key
  // is the same call — this closes the "empty state with no way to add a
  // config key" QA dead end.
  async function createKey() {
    const key = newKey.trim();
    if (!key) { setNewErr("Key is required"); return; }
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) { setNewErr("Key may contain letters, digits, dots, dashes, underscores"); return; }
    let parsed: unknown; try { parsed = JSON.parse(newVal || "null"); } catch { setNewErr("Value must be valid JSON (e.g. \"text\", 42, true, {\"a\":1})"); return; }
    const r = await api(`/api/admin/config/${key}`, { method: "PUT", body: JSON.stringify({ value: parsed }) });
    if (!r.ok) { setNewErr(await r.text()); return; }
    setShowNew(false); setNewKey(""); setNewVal(""); setNewErr(null); load();
  }

  const columns: ColumnDef<ConfigEntry>[] = [
    { key: "key", header: "Key", sortable: true },
    {
      key: "value", header: "Value",
      render: (v, row) => editing === row.key ? (
        <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
          <textarea value={editVal} onChange={e => setEditVal(e.target.value)} rows={2} aria-label={`Value for ${row.key}`} style={{ width: 280, fontFamily: "monospace", fontSize: 12, padding: 4, border: "1px solid #cbd5e1", borderRadius: 4 }} />
          {saveErr && <span style={{ color: "#b91c1c", fontSize: 12 }}>{saveErr}</span>}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => save(row.key)} style={{ padding: "3px 8px", background: "#15803d", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 12 }}>Save</button>
            <button onClick={() => { setEditing(null); setSaveErr(null); }} style={{ padding: "3px 8px", background: "#f1f5f9", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 3, cursor: "pointer", fontSize: 12 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <span style={{ cursor: "pointer" }} onClick={() => { setEditing(row.key); setEditVal(v === "<redacted>" ? "" : JSON.stringify(v, null, 2)); setSaveErr(null); }}>
          {v === "<redacted>" ? <em style={{ color: "#475569" }}>{"<redacted>"}</em> : <code style={{ fontSize: 12 }}>{JSON.stringify(v)}</code>}
          {" "}<span style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 600 }}>edit</span>
        </span>
      ),
    },
    { key: "updated_at", header: "Updated", sortable: true, render: v => new Date(v).toLocaleString() },
  ];

  return (
    <AdminPageTemplate title="System Config" breadcrumbs={[{ label: "Admin" }, { label: "System Config" }]}
      actionButton={<button onClick={() => { setShowNew(true); setNewErr(null); }} style={{ padding: "8px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>+ Add config key</button>}>
      {showNew && (
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", background: "#f0f9ff", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="config.key.name" aria-label="Config key"
            style={{ padding: "6px 10px", border: "1px solid #94a3b8", borderRadius: 4, fontSize: 14, width: 220, fontFamily: "monospace" }} />
          <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder='JSON value, e.g. "on" or 42 or {"a":1}' aria-label="Config value (JSON)"
            style={{ padding: "6px 10px", border: "1px solid #94a3b8", borderRadius: 4, fontSize: 14, width: 280, fontFamily: "monospace" }} />
          <button onClick={createKey} style={{ padding: "6px 14px", background: "#15803d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>Create</button>
          <button onClick={() => { setShowNew(false); setNewErr(null); }} style={{ padding: "6px 10px", background: "#f1f5f9", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>Cancel</button>
          {newErr && <span role="alert" style={{ color: "#b91c1c", fontSize: 13, width: "100%" }}>{newErr}</span>}
        </div>
      )}
      <AdminTable columns={columns} rows={entries} loading={loading} error={error}
        emptyMessage="No config keys yet. Use “+ Add config key” to create the first one." />
    </AdminPageTemplate>
  );
}
