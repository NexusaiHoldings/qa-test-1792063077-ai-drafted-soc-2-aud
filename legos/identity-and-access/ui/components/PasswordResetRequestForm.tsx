"use client";
import React, { FormEvent, useState } from "react";

interface PasswordResetRequestFormProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
  apiBase?: string;
}

export function PasswordResetRequestForm({
  onSuccess, onError, apiBase = "",
}: PasswordResetRequestFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) { setError("Email is required"); return; }
    setError(""); setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        const msg = "Too many reset requests. Please wait before trying again.";
        setError(msg); onError?.(msg);
      } else {
        setSubmitted(true);
        onSuccess?.();
      }
    } catch {
      const msg = "Network error. Please check your connection.";
      setError(msg); onError?.(msg);
    } finally { setSubmitting(false); }
  }

  if (submitted) {
    return (
      <div role="status">
        If an account exists for that email address, a reset link has been sent.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Request password reset">
      <div>
        <label htmlFor="prr-email">Email address</label>
        <input
          id="prr-email" type="email" autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
          aria-invalid={!!error} disabled={submitting} required
        />
      </div>
      {error && <div role="alert">{error}</div>}
      <button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Sending\u2026" : "Send reset link"}
      </button>
    </form>
  );
}
