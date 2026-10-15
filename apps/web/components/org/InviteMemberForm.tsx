"use client";

/**
 * InviteMemberForm — substrate-side invite form for the org page
 * (substrate-lego-wiring-001 Phase 2). The org lego ships MembersTable
 * (read-only) but no invite UI, so the substrate supplies this small form.
 * POSTs to /api/orgs/[orgId]/invite; the shim injects invited_by from session.
 */
import { useState, type FormEvent, type JSX } from "react";

const ROLES = ["admin", "member", "viewer"] as const;

export function InviteMemberForm({ orgId }: { orgId: string }): JSX.Element {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (res.ok) {
        setStatus("Invitation sent.");
        setEmail("");
      } else {
        setStatus((await res.text()) || "Could not send invitation.");
      }
    } catch {
      setStatus("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm">
        <span className="mb-1 text-gray-600">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col text-sm">
        <span className="mb-1 text-gray-600">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send invite"}
      </button>
      {status && <p className="w-full text-sm text-gray-600">{status}</p>}
    </form>
  );
}
