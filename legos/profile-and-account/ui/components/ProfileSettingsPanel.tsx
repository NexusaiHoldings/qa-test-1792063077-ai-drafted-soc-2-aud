"use client";
import React, { FormEvent, useEffect, useState } from "react";

/**
 * ProfileSettingsPanel — profile editor (slot: profile_settings_panel).
 */
interface ProfileSettingsPanelProps {
  apiBase?: string;
  userId: string;
}

export function ProfileSettingsPanel({ apiBase = "", userId }: ProfileSettingsPanelProps) {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("");
  const [completion, setCompletion] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`${apiBase}/api/account/profile?user_id=${encodeURIComponent(userId)}`);
      if (active && res.ok) {
        const d = await res.json();
        const p = d.profile ?? {};
        setDisplayName(p.display_name ?? "");
        setBio(p.bio ?? "");
        setTimezone(p.timezone ?? "");
        setCompletion(p.completion_score ?? 0);
      }
    })();
    return () => { active = false; };
  }, [apiBase, userId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const res = await fetch(`${apiBase}/api/account/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, display_name: displayName, bio, timezone }),
    });
    if (res.ok) {
      const d = await res.json();
      setCompletion(d.completion_score ?? completion);
      setSaved(true);
    }
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 420, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>Profile {completion}% complete</div>
      <label>Display name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
      </label>
      <label>Bio
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
      </label>
      <label>Timezone
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. America/Los_Angeles"
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
      </label>
      <button type="submit"
        style={{ padding: 10, borderRadius: 6, border: "none", background: "var(--substrate-accent, #2563eb)", color: "#fff", fontWeight: 600 }}>
        Save profile
      </button>
      {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>Saved.</span>}
    </form>
  );
}
