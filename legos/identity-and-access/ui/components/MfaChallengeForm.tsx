"use client";
import React, { FormEvent, useState } from "react";

interface MfaChallengeFormProps {
  userId: string;
  factorId: string;
  fernetKey: string;
  onSuccess?: (userId: string) => void;
  onError?: (message: string) => void;
  apiBase?: string;
}

export function MfaChallengeForm({
  userId, factorId, fernetKey, onSuccess, onError, apiBase = "",
}: MfaChallengeFormProps) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code) { setError("Code is required"); return; }
    setError(""); setSubmitting(true);
    try {
      const endpoint = mode === "totp"
        ? "/api/auth/mfa/challenge"
        : "/api/auth/mfa/recovery-code";
      const body = mode === "totp"
        ? { user_id: userId, factor_id: factorId, code, fernet_key: fernetKey }
        : { user_id: userId, code };
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = await res.json();
        onSuccess?.(d.user_id);
      } else if (res.status === 401) {
        setError("Invalid code. Please try again.");
      } else {
        const msg = "Verification failed. Please try again.";
        setError(msg); onError?.(msg);
      }
    } catch {
      const msg = "Network error. Please check your connection.";
      setError(msg); onError?.(msg);
    } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Two-factor authentication">
      <p>
        {mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of your saved recovery codes."}
      </p>
      <div>
        <label htmlFor="mfa-code">
          {mode === "totp" ? "Authenticator code" : "Recovery code"}
        </label>
        <input
          id="mfa-code"
          type="text"
          inputMode={mode === "totp" ? "numeric" : "text"}
          pattern={mode === "totp" ? "[0-9]{6}" : undefined}
          maxLength={mode === "totp" ? 6 : 9}
          value={code} onChange={e => setCode(e.target.value)}
          aria-invalid={!!error} disabled={submitting} required
          autoComplete="one-time-code"
        />
      </div>
      {error && <div role="alert">{error}</div>}
      <button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Verifying\u2026" : "Verify"}
      </button>
      <button
        type="button"
        onClick={() => { setMode(m => m === "totp" ? "recovery" : "totp"); setCode(""); setError(""); }}
      >
        {mode === "totp" ? "Use a recovery code instead" : "Use authenticator app"}
      </button>
    </form>
  );
}
