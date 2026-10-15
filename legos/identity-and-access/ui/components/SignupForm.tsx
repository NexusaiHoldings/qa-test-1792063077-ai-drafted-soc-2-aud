"use client";
import React, { FormEvent, useState } from "react";
import { OAuthButton } from "./OAuthButton";

type OAuthProvider = "google" | "github";

interface SignupFormProps {
  onSuccess?: (token: string, userId: string) => void;
  onError?: (message: string) => void;
  /** Slot: before_signup_fields */
  beforeSignupFields?: React.ReactNode;
  /** Slot: signup_legal_acknowledgment */
  legalAcknowledgment?: React.ReactNode;
  apiBase?: string;
  /** OAuth providers to show (from config.providers); e.g. ["google_oauth", "github_oauth"] */
  oauthProviders?: string[];
}

export function SignupForm({
  onSuccess, onError, beforeSignupFields, legalAcknowledgment, apiBase = "",
  oauthProviders = [],
}: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = "Enter a valid email address";
    if (!password || password.length < 8) e.password = "Password must be at least 8 characters";
    if (password !== confirm) e.confirm = "Passwords do not match";
    return e;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ve = validate();
    if (Object.keys(ve).length > 0) { setErrors(ve); return; }
    setErrors({}); setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirm_password: confirm }),
      });
      if (res.status === 201) {
        const d = await res.json();
        onSuccess?.(d.session_token, d.user_id);
      } else if (res.status === 409) {
        setErrors({ email: "An account with this email already exists" });
      } else {
        const d = await res.json().catch(() => null);
        const msg = (d?.errors as string[] | undefined)?.join(", ") ?? "Please check your inputs";
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
    <form onSubmit={handleSubmit} noValidate aria-label="Create account">
      {enabledOAuth.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {enabledOAuth.map(p => (
            <OAuthButton key={p} provider={p} apiBase={apiBase}
              label={`Sign up with ${p.charAt(0).toUpperCase() + p.slice(1)}`} />
          ))}
          <hr style={{ margin: "8px 0" }} aria-hidden="true" />
        </div>
      )}
      {beforeSignupFields}
      <div>
        <label htmlFor="su-email">Email address</label>
        <input id="su-email" type="email" autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)}
          aria-invalid={!!errors.email} disabled={submitting} required />
        {errors.email && <span role="alert">{errors.email}</span>}
      </div>
      <div>
        <label htmlFor="su-pw">Password</label>
        <input id="su-pw" type="password" autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)}
          aria-invalid={!!errors.password} disabled={submitting} required />
        {errors.password && <span role="alert">{errors.password}</span>}
      </div>
      <div>
        <label htmlFor="su-confirm">Confirm password</label>
        <input id="su-confirm" type="password" autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          aria-invalid={!!errors.confirm} disabled={submitting} required />
        {errors.confirm && <span role="alert">{errors.confirm}</span>}
      </div>
      {legalAcknowledgment ?? (
        <p>By creating an account you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
      )}
      {errors.general && <div role="alert">{errors.general}</div>}
      <button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Creating account\u2026" : "Create account"}
      </button>
    </form>
  );
}
