/**
 * /admin/legal — Legal & compliance admin (admin-legal-001).
 *
 * Shows the full version history of every legal document (terms, privacy,
 * cookie, accessibility) with which version is currently effective, and lets an
 * admin publish a new version. Reads/POSTs /api/admin/legal/documents (legal
 * lego). First-class styling for the AdminShell light content area.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

interface DocRow {
  id: string;
  doc_type: string;
  version: string;
  jurisdiction: string;
  content_summary: string | null;
  effective_at: string;
  published_by: string | null;
  created_at: string;
  is_effective: boolean;
}

const DOC_TYPES = [
  "terms_of_service",
  "privacy_policy",
  "cookie_policy",
  "accessibility_statement",
] as const;
const JURISDICTIONS = ["us", "eu", "uk", "ca", "au", "global"] as const;

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)", overflow: "hidden",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: 12, fontWeight: 600,
  color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em",
  borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
};
const td: React.CSSProperties = {
  padding: "12px 16px", fontSize: 14, color: "#0f172a", borderBottom: "1px solid #f1f5f9",
};
const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4,
};
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 14, borderRadius: 8,
  border: "1px solid #cbd5e1", boxSizing: "border-box",
};

function prettyType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmt(ts: string): string {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function LegalAdminPage(): JSX.Element {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    doc_type: "terms_of_service" as string,
    version: "",
    jurisdiction: "us" as string,
    content_summary: "",
    content_html: "",
    force_reacknowledge: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/legal/documents", { cache: "no-store" });
      const d = await r.json();
      setDocs(Array.isArray(d.documents) ? d.documents : []);
      setErr(d.error || (typeof d === "string" ? d : null));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    setSaving(true);
    setFormMsg(null);
    try {
      const r = await fetch("/api/admin/legal/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          effective_at: new Date().toISOString(),
        }),
      });
      if (r.ok) {
        setFormMsg("Published.");
        setForm({ ...form, version: "", content_summary: "", content_html: "", force_reacknowledge: false });
        setShowForm(false);
        await load();
      } else {
        setFormMsg(`Failed: ${await r.text()}`);
      }
    } catch (e) {
      setFormMsg(`Failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const canPublish = form.version.trim() && form.content_html.trim();

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Legal &amp; Compliance</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
            Every published version of your policies. The effective version is what visitors see and acknowledge.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ fontSize: 14, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", whiteSpace: "nowrap" }}>
          {showForm ? "Cancel" : "+ Publish version"}
        </button>
      </div>

      {err && (
        <div style={{ ...card, padding: 16, marginBottom: 16, color: "#991b1b", background: "#fef2f2", borderColor: "#fecaca" }}>
          Couldn&apos;t load documents: {err}
        </div>
      )}

      {showForm && (
        <div style={{ ...card, padding: 18, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={label}>Document</label>
              <select style={input} value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{prettyType(t)}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Version</label>
              <input style={input} placeholder="e.g. 2026-06-23" value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })} />
            </div>
            <div>
              <label style={label}>Jurisdiction</label>
              <select style={input} value={form.jurisdiction}
                onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}>
                {JURISDICTIONS.map((j) => <option key={j} value={j}>{j.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Summary (optional)</label>
            <input style={input} placeholder="One-line change summary" value={form.content_summary}
              onChange={(e) => setForm({ ...form, content_summary: e.target.value })} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Content (HTML)</label>
            <textarea style={{ ...input, minHeight: 160, fontFamily: "monospace", fontSize: 13 }}
              placeholder="<h1>Terms of Service</h1>…" value={form.content_html}
              onChange={(e) => setForm({ ...form, content_html: e.target.value })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: 13, color: "#334155", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.force_reacknowledge}
                onChange={(e) => setForm({ ...form, force_reacknowledge: e.target.checked })} />
              Force users to re-acknowledge
            </label>
            <button disabled={!canPublish || saving} onClick={publish}
              style={{ fontSize: 14, fontWeight: 600, padding: "8px 16px", borderRadius: 8,
                cursor: canPublish && !saving ? "pointer" : "not-allowed",
                border: "1px solid #4338ca", background: canPublish ? "#4f46e5" : "#c7d2fe", color: "#fff" }}>
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
          {formMsg && <p style={{ marginTop: 12, fontSize: 13, color: formMsg.startsWith("Failed") ? "#b91c1c" : "#15803d" }}>{formMsg}</p>}
        </div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Document</th>
              <th style={th}>Version</th>
              <th style={th}>Jurisdiction</th>
              <th style={th}>Effective</th>
              <th style={th}>State</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={td} colSpan={5}>Loading…</td></tr>
            ) : docs.length === 0 ? (
              <tr><td style={{ ...td, color: "#64748b" }} colSpan={5}>No legal documents published yet.</td></tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id}>
                  <td style={td}>{prettyType(d.doc_type)}</td>
                  <td style={td}>{d.version}</td>
                  <td style={{ ...td, textTransform: "uppercase", color: "#64748b" }}>{d.jurisdiction}</td>
                  <td style={{ ...td, color: "#64748b" }}>{fmt(d.effective_at)}</td>
                  <td style={td}>
                    {d.is_effective ? (
                      <span style={{ background: "#dcfce7", color: "#166534", fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999 }}>Effective</span>
                    ) : (
                      <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999 }}>Superseded</span>
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
