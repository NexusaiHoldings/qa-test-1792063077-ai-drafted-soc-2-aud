"use client";
import React, { FormEvent, useState } from "react";

interface PasswordResetConfirmFormProps {
  token: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  apiBase?: string;
  loginHref?: string;
}

export function PasswordResetConfirmForm({
  token, onSuccess, onError, apiBase = "", loginHref = "/login",
}: PasswordResetConfirmFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ve: Record<string, string> = {};
    if (!newPassword) ve.newPassword = "Password is required";
    if (newPassword !== confirm) ve.confirm = "Passwords do not match";
    if (Object.keys(ve).length > 0) { setErrors(ve); return; }
    setErrors({}); setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (res.ok) {
        setDone(true); onSuccess?.();
      } else if (res.status === 401) {
        setErrors({ general: "This reset link is invalid or has expired. Please request a new one." });
      } else {
        const msg = "Something went wrong. Please try again.";
        setErrors({ general: msg }); onError?.(msg);
      }
    } catch {
      const msg = "Network error. Please check your connection.";
      setErrors({ general: msg }); onError?.(msg);
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div role="status">
        Your password has been updated. <a href={loginHref}>Sign in</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Set new password">
      <div>
        <label htmlFor="prc-pw">New password</label>
        <input
          id="prc-pw" type="password" autoComplete="new-password"
          value={newPassword} onChange={e => setNewPassword(e.target.value)}
          aria-invalid={!!errors.newPassword} disabled={submitting} required
        />
        {errors.newPassword && <span role="alert">{errors.newPassword}</span>}
      </div>
      <div>
        <label htmlFor="prc-confirm">Confirm new password</label>
        <input
          id="prc-confirm" type="password" autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          aria-invalid={!!errors.confirm} disabled={submitting} required
        />
        {errors.confirm && <span role="alert">{errors.confirm}</span>}
      </div>
      {errors.general && <div role="alert">{errors.general}</div>}
      <button type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Updating\u2026" : "Set new password"}
      </button>
    </form>
  );
}
