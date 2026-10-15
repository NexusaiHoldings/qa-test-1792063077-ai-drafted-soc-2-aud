"use client";
import React, { FormEvent, useState } from "react";

interface DeleteAccountDialogProps {
  userEmail: string;
  sessionToken: string;
  apiBase?: string;
  onDeleted?: () => void;
  onClose?: () => void;
}

export function DeleteAccountDialog({
  userEmail, sessionToken, apiBase = "", onDeleted, onClose,
}: DeleteAccountDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
      setError("Email does not match your account email");
      return;
    }
    setError(""); setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/account/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        setDone(true);
        onDeleted?.();
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? "Failed to schedule deletion");
      }
    } catch { setError("Network error"); }
    finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Account deletion scheduled">
        <h2>Deletion scheduled</h2>
        <p>Your account will be deleted in 30 days. You can cancel this at any time by signing in and visiting Account Settings.</p>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Delete account">
      <h2>Delete your account</h2>
      <p>
        Your account will be <strong>permanently deleted after 30 days</strong>.
        You may cancel this at any time during the grace period.
        All your data will be removed in compliance with GDPR right-to-erasure requirements.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="da-email">
          To confirm, type your email address: <strong>{userEmail}</strong>
        </label>
        <input
          id="da-email"
          type="email"
          value={confirmEmail}
          onChange={e => setConfirmEmail(e.target.value)}
          aria-invalid={!!error}
          disabled={submitting}
          required
          autoComplete="off"
        />
        {error && <p role="alert" style={{ color: "red" }}>{error}</p>}
        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            type="submit"
            disabled={submitting || confirmEmail.toLowerCase() !== userEmail.toLowerCase()}
            aria-busy={submitting}
            style={{ color: "white", background: "red", border: "none", padding: "8px 16px", borderRadius: "4px" }}
          >
            {submitting ? "Scheduling deletion…" : "Delete my account"}
          </button>
        </div>
      </form>
    </div>
  );
}
