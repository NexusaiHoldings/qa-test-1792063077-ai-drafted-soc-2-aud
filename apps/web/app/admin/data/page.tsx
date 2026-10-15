/**
 * /admin/data — Product data admin index (admin-data-001).
 *
 * Lists the company's OWN domain tables (platform/lego tables excluded) with row
 * counts. Click a table to browse and edit its rows. This is the generic
 * "operate the business" surface — it works for any company because it reflects
 * over the live schema rather than being hand-built per company.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TableSummary {
  name: string;
  rows: number;
  columns: number;
}

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)", overflow: "hidden",
};

function pretty(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DataAdminIndex(): JSX.Element {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/data/tables", { cache: "no-store" });
        const d = await r.json();
        setTables(d.tables || []);
        setErr(d.error || null);
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Product Data</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          Your company&apos;s own records — browse and edit rows directly. Platform tables
          (users, billing, legal&hellip;) are managed from their own admin pages.
        </p>
      </div>

      {err && (
        <div style={{ ...card, padding: 16, marginBottom: 16, color: "#991b1b", background: "#fef2f2", borderColor: "#fecaca" }}>
          Couldn&apos;t load tables: {err}
        </div>
      )}

      {loading ? (
        <div style={{ ...card, padding: 16, color: "#64748b" }}>Loading…</div>
      ) : tables.length === 0 ? (
        <div style={{ ...card, padding: 16, color: "#64748b" }}>
          No product tables found yet. They appear here once your app defines its own data.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {tables.map((t) => (
            <Link key={t.name} href={`/admin/data/${encodeURIComponent(t.name)}`} style={{ textDecoration: "none" }}>
              <div style={{ ...card, padding: 16, cursor: "pointer" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{pretty(t.name)}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", marginTop: 2 }}>{t.name}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 10 }}>
                  {t.rows < 0 ? "—" : t.rows.toLocaleString()} {t.rows === 1 ? "row" : "rows"} · {t.columns} cols
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
