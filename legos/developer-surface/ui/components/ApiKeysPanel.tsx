"use client";
import React, { useEffect, useState } from "react";

/** ApiKeysPanel — API key management (slot: api_keys_panel). */
interface ApiKeysPanelProps { apiBase?: string; userId: string; }
interface Key { id: string; name: string; prefix: string; status: string; last_used_at?: string; }

export function ApiKeysPanel({ apiBase = "", userId }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<Key[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`${apiBase}/api/dev/keys?user_id=${encodeURIComponent(userId)}`);
      if (active && res.ok) { const d = await res.json(); setKeys(d.keys ?? []); }
    })();
    return () => { active = false; };
  }, [apiBase, userId]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
      <h3 style={{ margin: "0 0 8px" }}>API Keys</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
              <td style={{ padding: 8 }}>{k.name}</td>
              <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{k.prefix}…</td>
              <td style={{ padding: 8, fontSize: 12, color: k.status === "active" ? "#16a34a" : "#b91c1c" }}>{k.status}</td>
            </tr>
          ))}
          {keys.length === 0 && <tr><td style={{ padding: 8, opacity: 0.6 }}>No API keys yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
