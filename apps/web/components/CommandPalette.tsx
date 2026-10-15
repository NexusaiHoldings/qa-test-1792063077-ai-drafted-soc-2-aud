"use client";

/**
 * CommandPalette — global Cmd/Ctrl+K search (substrate-lego-wiring-001 search
 * gap-fill). The lego's palette renders results as non-clickable text; this
 * substrate version navigates to each result's `url` (e.g. /help/<slug>),
 * populated by the substrate indexer. Queries /api/search.
 */
import { useEffect, useRef, useState, type JSX } from "react";

interface Result {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  category?: string | null;
  url?: string | null;
}

export function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
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
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const d = await res.json();
          setResults(d.results ?? []);
        }
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;

  function go(r: Result): void {
    if (r.url) window.location.href = r.url;
  }

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 80, display: "flex", justifyContent: "center", paddingTop: "12vh" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "90vw", background: "#fff", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}
      >
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          style={{ width: "100%", padding: 16, border: "none", fontSize: 16, outline: "none", borderBottom: "1px solid #eee" }}
        />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 360, overflowY: "auto" }}>
          {results.map((r) => (
            <li
              key={r.id}
              onClick={() => go(r)}
              style={{ padding: "10px 16px", borderBottom: "1px solid #f5f5f5", cursor: r.url ? "pointer" : "default" }}
            >
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {r.entity_type}
                {r.category ? ` · ${r.category}` : ""}
              </div>
            </li>
          ))}
          {q.trim() && results.length === 0 && <li style={{ padding: 16, opacity: 0.6 }}>No results.</li>}
        </ul>
      </div>
    </div>
  );
}
