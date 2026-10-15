"use client";
/* Preferences center — toggle notifications per channel + category. */
import React, { useEffect, useState } from "react";

interface Preference {
  channel: "email" | "in_app" | "web_push" | "sms";
  category: string;
  enabled: boolean;
}

const CATEGORIES = ["transactional", "billing", "security", "marketing"];
const CHANNELS: Array<Preference["channel"]> = ["email", "in_app", "web_push", "sms"];

export function PreferencesCenter() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function key(channel: string, category: string) { return `${channel}:${category}`; }

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((d) => {
        const init: Record<string, boolean> = {};
        for (const p of (d.preferences || []) as Preference[]) {
          init[key(p.channel, p.category)] = p.enabled;
        }
        setPrefs(init);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggle(channel: string, category: string) {
    const k = key(channel, category);
    setPrefs((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  async function save() {
    setSaving(true);
    const updates: Preference[] = [];
    for (const c of CHANNELS) for (const cat of CATEGORIES) {
      updates.push({ channel: c, category: cat, enabled: prefs[key(c, cat)] !== false });
    }
    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: updates }),
    });
    setSaving(false);
  }

  if (loading) return <div className="prefs-center loading">Loading...</div>;

  return (
    <div className="prefs-center">
      <h3>Notification Preferences</h3>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            {CHANNELS.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => (
            <tr key={cat}>
              <td>{cat}</td>
              {CHANNELS.map((c) => {
                const k = key(c, cat);
                const enabled = prefs[k] !== false;
                return (
                  <td key={c}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle(c, cat)}
                      aria-label={`${c} ${cat}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
