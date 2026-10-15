"use client";

/**
 * ApiKeyManager — substrate-side developer API-key surface
 * (substrate-lego-wiring-001 Phase 3). The lego ships a list-only ApiKeysPanel
 * with no create/revoke UI, so the substrate supplies the full manager:
 * list + create (one-time secret reveal) + revoke, against /api/dev/keys.
 */
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  status: string;
  last_used_at?: string | null;
}

export function ApiKeyManager(): JSX.Element {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/keys");
      if (res.ok) {
        const d = await res.json();
        setKeys(d.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNewSecret(null);
    try {
      const res = await fetch("/api/dev/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const d = await res.json();
        setNewSecret(d.secret ?? null);
        setName("");
        await refresh();
      } else {
        setError((await res.text()) || "Could not create key.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    if (!confirm("Revoke this API key? Apps using it will stop working immediately.")) return;
    await fetch(`/api/dev/keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-gray-600">Key name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production server"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create key"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {newSecret && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="mb-1 font-semibold text-amber-900">Copy your new key now — it won&apos;t be shown again:</p>
          <code className="block break-all rounded bg-white px-3 py-2 font-mono text-xs">{newSecret}</code>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-medium text-gray-900">Your keys</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 text-left">
                <th className="p-2">Name</th>
                <th className="p-2">Prefix</th>
                <th className="p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-gray-100">
                  <td className="p-2">{k.name}</td>
                  <td className="p-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="p-2">{k.status}</td>
                  <td className="p-2 text-right">
                    {k.status !== "revoked" && (
                      <button
                        type="button"
                        onClick={() => revoke(k.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
