"use client";
import React, { useEffect, useState } from "react";
import { AdminPageTemplate } from "./AdminPageTemplate";
import { AdminTable, ColumnDef } from "./AdminTable";

interface AuditEntry { id: string; admin_user_id: string; action: string; target_type: string; target_id: string; payload: unknown; performed_at: string; }
function tok() { return typeof window !== "undefined" ? (window as any).__ADMIN_TOKEN__ || "" : ""; }

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState(""); const [filterTarget, setFilterTarget] = useState("");

  function load() {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "100", ...(filterAction && { action: filterAction }), ...(filterTarget && { target_type: filterTarget }) });
    fetch(`/api/admin/audit?${qs}`, { headers: { "X-Admin-Token": tok() } })
      .then(r => r.json()).then(d => { setEntries(d.entries || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }
  useEffect(load, [filterAction, filterTarget]);

  const columns: ColumnDef<AuditEntry>[] = [
    { key: "performed_at", header: "When", sortable: true, render: v => new Date(v).toLocaleString() },
    { key: "admin_user_id", header: "Admin", render: v => v.slice(0, 8) + "…" },
    { key: "action", header: "Action", sortable: true },
    { key: "target_type", header: "Target Type" },
    { key: "target_id", header: "Target ID" },
    { key: "payload", header: "Payload", render: (v, row) => (
      <span style={{ cursor: "pointer", color: "#1d4ed8", fontSize: 12, fontWeight: 600 }} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
        {expanded === row.id ? "▾ hide" : "▸ show"}
        {expanded === row.id && <pre style={{ marginTop: 4, background: "#f8fafc", padding: 6, borderRadius: 4, fontSize: 11, maxWidth: 360, overflow: "auto" }}>{JSON.stringify(v, null, 2)}</pre>}
      </span>
    )},
  ];

  const filterPills = (
    <div style={{ display: "flex", gap: 8 }}>
      <input value={filterAction} onChange={e => setFilterAction(e.target.value)} placeholder="Filter by action" style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13, width: 180 }} />
      <input value={filterTarget} onChange={e => setFilterTarget(e.target.value)} placeholder="Filter by target type" style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13, width: 180 }} />
    </div>
  );

  return (
    <AdminPageTemplate title="Audit Log" breadcrumbs={[{ label: "Admin" }, { label: "Audit Log" }]}>
      <AdminTable columns={columns} rows={entries} loading={loading} error={error} emptyMessage="No audit entries found." filterPills={filterPills} />
    </AdminPageTemplate>
  );
}
