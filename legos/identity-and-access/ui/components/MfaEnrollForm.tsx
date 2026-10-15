"use client";
import React, { FormEvent, useState } from "react";

interface MfaEnrollFormProps {
  sessionToken: string;
  onSuccess?: (recoveryCodes: string[]) => void;
  onError?: (message: string) => void;
  apiBase?: string;
}

interface EnrollData {
  factor_id: string;
  otpauth_uri: string;
  secret_b32: string;
  recovery_codes: string[];
  fernet_key: string;
}

export function MfaEnrollForm({ sessionToken, onSuccess, onError, apiBase = "" }: MfaEnrollFormProps) {
  const [step, setStep] = useState<"start" | "verify" | "done">("start");
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startEnrollment() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/api/auth/mfa/enroll/totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ label: "Authenticator" }),
      });
      if (res.ok) {
        const d: EnrollData = await res.json();
        setEnrollData(d); setStep("verify");
      } else if (res.status === 501) {
        setError("MFA enrollment is not yet available. Please try again later.");
      } else {
        setError("Failed to start enrollment. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally { setLoading(false); }
  }

  async function verifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enrollData) return;
    if (!code || code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/mfa/enroll/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factor_id: enrollData.factor_id, code, fernet_key: enrollData.fernet_key }),
      });
      if (res.ok) {
        setStep("done"); onSuccess?.(enrollData.recovery_codes);
      } else if (res.status === 401) {
        setError("Incorrect code. Please try again.");
      } else {
        setError("Verification failed. Please restart enrollment.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally { setLoading(false); }
  }

  if (step === "start") {
    return (
      <div aria-label="Set up two-factor authentication">
        <p>Add an extra layer of security to your account using an authenticator app.</p>
        {error && <div role="alert">{error}</div>}
        <button onClick={startEnrollment} disabled={loading} aria-busy={loading}>
          {loading ? "Loading\u2026" : "Set up authenticator"}
        </button>
      </div>
    );
  }

  if (step === "verify" && enrollData) {
    return (
      <form onSubmit={verifyCode} noValidate aria-label="Verify authenticator code">
        <p>Scan this QR code with your authenticator app, then enter the 6-digit code below.</p>
        <p><code style={{ wordBreak: "break-all" }}>{enrollData.otpauth_uri}</code></p>
        <div>
          <label htmlFor="mfa-enroll-code">6-digit code</label>
          <input
            id="mfa-enroll-code" type="text" inputMode="numeric" pattern="[0-9]{6}"
            maxLength={6} value={code} onChange={e => setCode(e.target.value)}
            aria-invalid={!!error} disabled={loading} required
          />
        </div>
        {error && <div role="alert">{error}</div>}
        <button type="submit" disabled={loading} aria-busy={loading}>
          {loading ? "Verifying\u2026" : "Verify code"}
        </button>
      </form>
    );
  }

  if (step === "done" && enrollData) {
    return (
      <div role="status" aria-label="MFA enrollment complete">
        <p>Two-factor authentication is now active.</p>
        <p><strong>Save your recovery codes</strong> — you'll need them if you lose access to your authenticator app.</p>
        <ul>
          {enrollData.recovery_codes.map(c => <li key={c}><code>{c}</code></li>)}
        </ul>
      </div>
    );
  }

  return null;
}
