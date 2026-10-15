"use client";

/**
 * AcceptInvitation — substrate-side accept button for /org/accept
 * (substrate-lego-wiring-001 Phase 2). Reads the invitation token from the
 * URL and POSTs to /api/orgs/accept; the shim injects user_id from session.
 */
import { useState, type JSX } from "react";

export function AcceptInvitation({ token }: { token: string }): JSX.Element {
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/orgs/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setStatus("ok");
        setMessage("You're in. Redirecting to your organization…");
        setTimeout(() => {
          window.location.href = "/org";
        }, 1200);
      } else {
        setStatus("error");
        setMessage((await res.text()) || "Could not accept this invitation.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-red-600">This invitation link is missing its token.</p>;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={accept}
        disabled={busy || status === "ok"}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Accepting…" : "Accept invitation"}
      </button>
      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-600" : "text-gray-600"}`}>{message}</p>
      )}
    </div>
  );
}
