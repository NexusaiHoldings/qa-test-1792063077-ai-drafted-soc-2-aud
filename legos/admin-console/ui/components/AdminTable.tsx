"use client";
import React, { useState } from "react";

export interface ColumnDef<T> { key: string; header: string; sortable?: boolean; render?: (value: any, row: T) => React.ReactNode; }
interface AdminTableProps<T extends Record<string, any>> { columns: ColumnDef<T>[]; rows: T[]; loading?: boolean; error?: string | null; emptyMessage?: string; pageSize?: number; filterPills?: React.ReactNode; }

const TH: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#475569", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", userSelect: "none" };
const TD: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "#1e293b", borderBottom: "1px solid #f1f5f9" };

export function AdminTable<T extends Record<string, any>>({ columns, rows, loading = false, error = null, emptyMessage = "No records found.", pageSize = 25, filterPills }: AdminTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);

  const sorted = sortKey ? [...rows].sort((a, b) => { const av = a[sortKey], bv = b[sortKey]; return av < bv ? (sortAsc ? -1 : 1) : av > bv ? (sortAsc ? 1 : -1) : 0; }) : rows;
  const totalPages = Math.ceil(sorted.length / pageSize);
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function onSort(key: string) { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } setPage(0); }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, textAlign: "center", color: "#ef4444" }}>{error}</div>;

  return (
    <div>
      {filterPills && <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}>{filterPills}</div>}
      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#475569" }}>{emptyMessage}</div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{columns.map(c => (
                <th key={c.key} style={{ ...TH, cursor: c.sortable ? "pointer" : "default" }} onClick={() => c.sortable && onSort(c.key)}>
                  {c.header}{c.sortable && sortKey === c.key ? (sortAsc ? " ↑" : " ↓") : ""}
                </th>
              ))}</tr></thead>
              <tbody>{visible.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? "#fafafa" : "#fff" }}>
                  {columns.map(c => <td key={c.key} style={TD}>{c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "")}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "10px 14px", gap: 8, borderTop: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ padding: "4px 10px", fontSize: 13 }}>‹ Prev</button>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1} style={{ padding: "4px 10px", fontSize: 13 }}>Next ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
