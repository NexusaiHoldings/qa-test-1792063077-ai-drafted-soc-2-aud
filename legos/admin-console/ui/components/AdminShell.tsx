"use client";
import React, { useEffect, useState } from "react";

interface AdminSection { id: string; lego_name: string; section_name: string; section_order: number; routes: string[]; }
interface AdminShellProps { children: React.ReactNode; currentPath: string; adminUser?: { id: string; email: string }; onExit?: () => void; adminNavExtra?: React.ReactNode; enableImpersonation?: boolean; }

function tok(): string { return typeof window !== "undefined" ? (window as any).__ADMIN_TOKEN__ || "" : ""; }

export function AdminShell({ children, currentPath, adminUser, onExit, adminNavExtra, enableImpersonation = false }: AdminShellProps) {
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/sections", { headers: { "X-Admin-Token": tok() } })
      .then(r => r.json()).then(d => { setSections(d.sections || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const isActive = (routes: string[]) => routes.some(r => currentPath.startsWith(r.replace(/\{[^}]+\}/g, "")));
  const sb: React.CSSProperties = { width: 240, background: "#1e293b", color: "#f1f5f9", display: "flex", flexDirection: "column" };
  const navLink = (active: boolean): React.CSSProperties => ({
    display: "block", padding: "8px 16px", color: active ? "#38bdf8" : "#cbd5e1",
    background: active ? "#0f172a" : "transparent", textDecoration: "none", fontSize: 14,
    borderLeft: active ? "3px solid #38bdf8" : "3px solid transparent",
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <aside style={sb}>
        <div style={{ padding: "20px 16px 12px", fontSize: 18, fontWeight: 700, borderBottom: "1px solid #334155" }}>Admin Console</div>
        <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
          {loading && <div style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 13 }}>Loading…</div>}
          {error && <div style={{ padding: "8px 16px", color: "#f87171", fontSize: 13 }}>Failed to load sections</div>}
          {!loading && !error && sections.length === 0 && (
            <div style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 12 }}>No admin sections registered yet. Install a lego to see its admin pages here.</div>
          )}
          {sections.map(s => (
            <a key={s.id} href={s.routes[0]} style={navLink(isActive(s.routes))}>{s.section_name}</a>
          ))}
          {adminNavExtra}
        </nav>
      </aside>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* NOTE on explicit `color` below: the substrate wraps every page in
            <main>, whose `main button` rule paints button text with the theme's
            accent-text (often white). These inline styles override background
            but must ALSO override color, or the labels render white-on-pale
            (~1.1:1 — the "Exit admin near-invisible" QA class). */}
        <header style={{ height: 56, background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 24px", gap: 12 }}>
          <span style={{ flex: 1, fontSize: 14, color: "#334155" }}>{adminUser ? `Signed in as ${adminUser.email}` : "Admin"}</span>
          {enableImpersonation && (
            <button style={{ fontSize: 13, fontWeight: 600, padding: "4px 12px", background: "#fef3c7", color: "#78350f", border: "1px solid #fbbf24", borderRadius: 4, cursor: "pointer" }}
              onClick={() => alert("Impersonation deferred to security-review sprint")}>Impersonate user</button>
          )}
          {onExit && (
            <button style={{ fontSize: 13, fontWeight: 600, padding: "4px 12px", background: "#f1f5f9", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 4, cursor: "pointer" }} onClick={onExit}>Exit admin</button>
          )}
        </header>
        <main style={{ flex: 1, padding: 24, background: "#f8fafc", overflowY: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
