"use client";
import React, { FormEvent, useState } from "react";
import { OAuthButton } from "./OAuthButton";

type OAuthProvider = "google" | "github";

interface LoginFormProps {
  onSuccess?: (token: string, userId: string) => void;
  onError?: (message: string) => void;
  /** Slot: after_login_redirect */
  afterLoginRedirect?: (token: string) => void;
  apiBase?: string;
  dashboardHref?: string;
  /** OAuth providers to show (from config.providers); e.g. ["google_oauth", "github_oauth"] */
  oauthProviders?: string[];
}

export function LoginForm({
  onSuccess, onError, afterLoginRedirect, apiBase = "", dashboardHref = "/dashboard",
  oauthProviders = [],
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ve: Record<string, string> = {};
    if (!email) ve.email = "Email is required";
    if (!password) ve.password = "Password is required";
    if (Object.keys(ve).length > 0) { setErrors(ve); return; }
    setErrors({}); setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const d = await res.json();
        if (afterLoginRedirect) { afterLoginRedirect(d.session_token); }
        else {
          onSuccess?.(d.session_token, d.user_id);
          if (typeof window !== "undefined") window.location.href = dashboardHref;
        }
      } else if (res.status === 401) {
        setErrors({ general: "Invalid email or password" });
      } else {
        const msg = "Login failed. Please try again later.";
        setErrors({ general: msg }); onError?.(msg);
      }
    } catch {
      const msg = "Network error. Please check your connection.";
      setErrors({ general: msg }); onError?.(msg);
    } finally { setSubmitting(false); }
  }

  const enabledOAuth = oauthProviders
    .map(p => p.replace("_oauth", "") as OAuthProvider)
    .filter((p): p is OAuthProvider => p === "google" || p === "github");

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Sign in">
      {enabledOAuth.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {enabledOAuth.map(p => (
            <OAuthButton key={p} provider={p} apiBase={apiBase} />
          ))}
          <hr style={{ margin: "8px 0" }} aria-hidden="true" />
        </div>
      )}
      <div>
        <label htmlFor="li-email">Email address</label>
        <input id="li-email" type="email" autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
          aria-invalid={!!errors.email} disabled={submitting} required />
        {errors.email && <span role="alert">{errors.email}</span>}
      </div>
      <div>
        <label htmlFor="li-pw">Password</label>
        <input id="li-pw" type="password" autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
          aria-invalid={!!errors.password} disabled={submitting} required />
        {errors.password && <span role="alert">{errors.password}</span>}
      </div>
      {errors.general && <div role="alert">{errors.general}</div>}
      <a href="/forgot-password">Forgot your password?</a>
      <button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Signing in\u2026" : "Sign in"}
      </button>
    </form>
  );
}
