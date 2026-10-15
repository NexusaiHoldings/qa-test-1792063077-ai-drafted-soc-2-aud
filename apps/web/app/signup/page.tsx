/**
 * /signup — account creation page for auth-gated surfaces.
 *
 * Sprint substrate-auth-pages-001 (2026-06-01). Companion to /login. POSTs to
 * /api/auth/signup which, on 201, auto-logs-in the new user and sets the
 * HttpOnly session_token cookie, then we navigate home.
 */

"use client";

import { useState, type FormEvent, type JSX } from "react";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

export default function SignupPage(): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirm_password: confirm }),
      });
      if (res.status === 201) {
        window.location.href = "/";
        return;
      }
      // 4xx errors come back as plain text from the lego (policy / duplicate).
      const text = await res.text().catch(() => "");
      setError(text || "Sign up failed. Please try again.");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "3.5rem auto", padding: "0 1.25rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.35rem" }}>
        Create account
      </h1>
      <p style={{ fontSize: "0.9rem", opacity: 0.6, marginTop: 0, marginBottom: "1.5rem" }}>
        Create an account to start a project.
      </p>

      <form onSubmit={handleSubmit} noValidate aria-label="Create account">
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

        <label htmlFor="password" style={labelStyle}>
          Password
        </label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />

        <label htmlFor="confirm" style={labelStyle}>
          Confirm password
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
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>

      <p style={{ fontSize: "0.875rem", marginTop: "1.5rem", textAlign: "center" }}>
        Already have an account?{" "}
        <a href="/login" style={{ color: "var(--substrate-accent, #2563eb)", fontWeight: 600 }}>
          Sign in
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
