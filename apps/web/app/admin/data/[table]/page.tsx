/**
 * /admin/data/[table] — browse + edit rows of one product table (admin-data-001).
 *
 * Reads /api/admin/data/[table] (columns + paginated rows), edits via PATCH and
 * removes via DELETE on /api/admin/data/[table]/[id]. Only editable scalar
 * columns are shown as inputs; the primary key and complex columns (jsonb,
 * arrays) are read-only. Edit/delete are disabled for tables without a
 * single-column primary key.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface ColumnMeta {
  name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  is_pk: boolean;
  editable: boolean;
}
type Row = Record<string, unknown>;

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)", overflow: "hidden",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "9px 14px", fontSize: 11, fontWeight: 600,
  color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em",
  borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "9px 14px", fontSize: 13, color: "#0f172a",
  borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", maxWidth: 320,
  overflow: "hidden", textOverflow: "ellipsis",
};
const input: React.CSSProperties = {
  width: "100%", padding: "7px 9px", fontSize: 13, borderRadius: 7,
  border: "1px solid #cbd5e1", boxSizing: "border-box",
};
const btn = (fg: string, bd: string): React.CSSProperties => ({
  fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  border: `1px solid ${bd}`, background: "#fff", color: fg, marginLeft: 6,
});

function display(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

const PAGE = 50;

export default function TableBrowser(): JSX.Element {
  const params = useParams();
  const table = decodeURIComponent(
    Array.isArray(params.table) ? params.table[0] : (params.table as string),
  );

  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [pk, setPk] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/data/${encodeURIComponent(table)}?limit=${PAGE}&offset=${off}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || `HTTP ${r.status}`); setRows([]); return; }
      setColumns(d.columns || []);
      setPk(d.pk ?? null);
      setRows(d.rows || []);
      setTotal(d.total || 0);
      setOffset(d.offset || 0);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => { load(0); }, [load]);

  const editable = useMemo(() => columns.filter((c) => c.editable), [columns]);

  const startEdit = (row: Row) => {
    if (!pk) return;
    const id = String(row[pk]);
    const d: Record<string, string> = {};
    for (const c of editable) {
      const v = row[c.name];
      d[c.name] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    setDraft(d);
    setEditId(id);
  };

  const save = async () => {
    if (!editId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/data/${encodeURIComponent(table)}/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) { setErr((await r.json()).error || `HTTP ${r.status}`); return; }
      setEditId(null);
      await load(offset);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    if (!pk) return;
    const id = String(row[pk]);
    if (!confirm(`Delete this row from "${table}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) { setErr((await r.json()).error || `HTTP ${r.status}`); return; }
      await load(offset);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/data" style={{ fontSize: 13, color: "#4f46e5", textDecoration: "none" }}>← All tables</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "6px 0 0" }}>
          {table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
          <span style={{ fontFamily: "monospace" }}>{table}</span> · {total.toLocaleString()} rows
          {!pk && <span style={{ color: "#b45309" }}> · read-only (no single-column primary key)</span>}
        </p>
      </div>

      {err && (
        <div style={{ ...card, padding: 14, marginBottom: 14, color: "#991b1b", background: "#fef2f2", borderColor: "#fecaca" }}>
          {err}
        </div>
      )}

      {editId && (
        <div style={{ ...card, padding: 18, marginBottom: 16, borderColor: "#c7d2fe" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Edit row</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {editable.map((c) => (
              <div key={c.name}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 3 }}>
                  {c.name} <span style={{ color: "#94a3b8", fontWeight: 400 }}>({c.udt_name})</span>
                </label>
                {c.udt_name === "bool" ? (
                  <select style={input} value={draft[c.name] ?? ""} onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })}>
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input style={input} value={draft[c.name] ?? ""} onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          {editable.length === 0 && (
            <p style={{ fontSize: 13, color: "#64748b" }}>No editable columns on this table.</p>
          )}
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button disabled={busy || editable.length === 0} onClick={save}
              style={{ fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 7, cursor: "pointer",
                border: "1px solid #4338ca", background: "#4f46e5", color: "#fff" }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditId(null)}
              style={{ fontSize: 13, padding: "7px 14px", borderRadius: 7, cursor: "pointer",
                border: "1px solid #cbd5e1", background: "#fff", color: "#475569" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} style={th}>
                  {c.name}{c.is_pk ? " 🔑" : ""}
                </th>
              ))}
              {pk && <th style={{ ...th, textAlign: "right" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={td} colSpan={columns.length + 1}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td style={{ ...td, color: "#64748b" }} colSpan={columns.length + 1}>No rows.</td></tr>
            ) : (
              rows.map((row, i) => (
                <tr key={pk ? String(row[pk]) : i}>
                  {columns.map((c) => (
                    <td key={c.name} style={c.editable ? td : { ...td, color: "#64748b" }} title={display(row[c.name])}>
                      {display(row[c.name])}
                    </td>
                  ))}
                  {pk && (
                    <td style={{ ...td, textAlign: "right" }}>
                      <button onClick={() => startEdit(row)} style={btn("#4338ca", "#c7d2fe")}>Edit</button>
                      <button disabled={busy} onClick={() => remove(row)} style={btn("#b91c1c", "#fecaca")}>Delete</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <button disabled={offset === 0 || loading} onClick={() => load(Math.max(0, offset - PAGE))}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 7, cursor: offset === 0 ? "not-allowed" : "pointer",
              border: "1px solid #cbd5e1", background: "#fff", color: "#475569" }}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
          </span>
          <button disabled={offset + PAGE >= total || loading} onClick={() => load(offset + PAGE)}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 7, cursor: offset + PAGE >= total ? "not-allowed" : "pointer",
              border: "1px solid #cbd5e1", background: "#fff", color: "#475569" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
