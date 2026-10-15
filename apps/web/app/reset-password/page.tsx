/**
 * /reset-password?token=… — set a new password using a reset token.
 *
 * Reads the token from the query string, posts {token, new_password} to
 * /api/auth/password-reset/confirm. On success the user's sessions are expired
 * (lego behavior) and we prompt them to sign in with the new password.
 */

"use client";

import { useEffect, useState, type FormEvent, type JSX } from "react";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage(): JSX.Element {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing or invalid reset link. Request a new one.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (res.ok) {
        setDone(true);
      } else if (res.status === 401) {
        setError("This reset link is invalid or has expired. Request a new one.");
      } else {
        const text = await res.text().catch(() => "");
        setError(text || "Couldn't reset your password. Please try again.");
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
        Set a new password
      </h1>

      {done ? (
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
          Your password has been updated.{" "}
          <a href="/login" style={{ color: "#065f46", fontWeight: 700, textDecoration: "underline" }}>
            Sign in
          </a>
          .
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate aria-label="Set new password">
          <label htmlFor="password" style={labelStyle}>
            New password
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />

          <label htmlFor="confirm" style={labelStyle}>
            Confirm new password
          </label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
          />

          {error && (
            <div role="alert" style={errorStyle}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} style={buttonStyle}>
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
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
