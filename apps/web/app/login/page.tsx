/**
 * /login — sign-in page for auth-gated surfaces.
 *
 * Sprint substrate-auth-pages-001 (2026-06-01). Pre-fix, auth-gated pages
 * redirected to /api/auth/login (a POST-only API route) → browser GET → 405,
 * because no login PAGE existed. This is that page: it POSTs to the API route,
 * which sets the HttpOnly session_token cookie on success, then navigates to
 * the originally-requested page (?redirect=) or "/".
 */

"use client";

import { useState, type FormEvent, type JSX } from "react";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

function nextDestination(): string {
  if (typeof window === "undefined") return "/";
  const param = new URLSearchParams(window.location.search).get("redirect");
  // Only allow same-origin relative paths to avoid open-redirect.
  if (param && param.startsWith("/") && !param.startsWith("//")) return param;
  return "/";
}

export default function LoginPage(): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = nextDestination();
        return;
      }
      if (res.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Sign in failed. Please try again.");
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
        Sign in
      </h1>
      <p style={{ fontSize: "0.9rem", opacity: 0.6, marginTop: 0, marginBottom: "1.5rem" }}>
        Sign in to access your projects.
      </p>

      <form onSubmit={handleSubmit} noValidate aria-label="Sign in">
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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: "0.9rem",
            marginBottom: "0.35rem",
          }}
        >
          <label htmlFor="password" style={{ ...labelStyle, marginTop: 0, marginBottom: 0 }}>
            Password
          </label>
          <a
            href="/forgot-password"
            style={{ fontSize: "0.78rem", color: "var(--substrate-accent, #2563eb)", fontWeight: 600 }}
          >
            Forgot your password?
          </a>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />

        {error && (
          <div role="alert" style={errorStyle}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ fontSize: "0.875rem", marginTop: "1.5rem", textAlign: "center" }}>
        Don&apos;t have an account?{" "}
        <a href="/signup" style={{ color: "var(--substrate-accent, #2563eb)", fontWeight: 600 }}>
          Create one
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
