"use client";
import React, { useEffect, useState } from "react";

/**
 * CommandPalette — global cmd+K search (slot: command_palette).
 * Opens on Cmd/Ctrl+K; queries /api/search; renders ranked results.
 */
interface CommandPaletteProps { apiBase?: string; }
interface Result { id: string; entity_type: string; entity_id: string; title: string; category?: string; }

export function CommandPalette({ apiBase = "" }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${apiBase}/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) { const d = await res.json(); setResults(d.results ?? []); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, apiBase]);

  if (!open) return null;
  return (
    <div onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 80, display: "flex", justifyContent: "center", paddingTop: "12vh" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "90vw", background: "#fff", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
          style={{ width: "100%", padding: 16, border: "none", fontSize: 16, outline: "none", borderBottom: "1px solid #eee" }} />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 360, overflowY: "auto" }}>
          {results.map((r) => (
            <li key={r.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{r.entity_type}{r.category ? ` · ${r.category}` : ""}</div>
            </li>
          ))}
          {q.trim() && results.length === 0 && <li style={{ padding: 16, opacity: 0.6 }}>No results.</li>}
        </ul>
      </div>
    </div>
  );
}
