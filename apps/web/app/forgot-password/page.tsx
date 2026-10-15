/**
 * /forgot-password — request a password reset link (substrate-auth-reset-001).
 *
 * Posts the email to /api/auth/password-reset/request, which always returns a
 * safe reply (no account-existence leak). On submit we show the same
 * confirmation regardless, and the reset email (if the account exists) is sent
 * by buildEventBus via Resend.
 */

"use client";

import { useState, type FormEvent, type JSX } from "react";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok || res.status === 429) {
        setSent(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "3.5rem auto", padding: "0 1.25rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.35rem" }}>
        Reset your password
      </h1>

      {sent ? (
        <div
          role="status"
          style={{
            marginTop: "1rem",
            padding: "1rem",
            borderRadius: 8,
            background: "#ecfdf5",
            color: "#065f46",
            fontSize: "0.9rem",
            lineHeight: 1.5,
          }}
        >
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          password-reset link. Check your inbox (and spam). The link expires in
          1 hour.
        </div>
      ) : (
        <>
          <p style={{ fontSize: "0.9rem", opacity: 0.6, marginTop: 0, marginBottom: "1.5rem" }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <form onSubmit={handleSubmit} noValidate aria-label="Reset password">
            <label htmlFor="email" style={labelStyle}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              style={inputStyle}
            />
            {error && (
              <div role="alert" style={errorStyle}>
                {error}
              </div>
            )}
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}

      <p style={{ fontSize: "0.875rem", marginTop: "1.5rem", textAlign: "center" }}>
        <a href="/login" style={{ color: "var(--substrate-accent, #2563eb)", fontWeight: 600 }}>
          Back to sign in
        </a>
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
  marginTop: "0.9rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: 7,
  border: "1px solid rgba(128,128,128,0.35)",
  fontSize: "0.95rem",
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  marginTop: "0.9rem",
  padding: "0.6rem 0.75rem",
  borderRadius: 7,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: "0.85rem",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "1.4rem",
  padding: "0.65rem 1rem",
  borderRadius: 7,
  border: "none",
  background: "var(--substrate-accent, #2563eb)",
  color: "#fff",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
};
