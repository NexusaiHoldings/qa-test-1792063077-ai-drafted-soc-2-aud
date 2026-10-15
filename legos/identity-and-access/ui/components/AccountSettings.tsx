"use client";
import React, { useState } from "react";
import { SessionsList } from "./SessionsList";
import { LoginHistory } from "./LoginHistory";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

type Tab = "overview" | "sessions" | "history" | "security";
interface MfaFactor { id: string; factor_type: string; status: string; }

interface AccountSettingsProps {
  userEmail: string;
  sessionToken: string;
  mfaFactors?: MfaFactor[];
  apiBase?: string;
  onPasswordResetRequest?: () => void;
  onSignOut?: () => void;
}

export function AccountSettings({
  userEmail, sessionToken, mfaFactors = [], apiBase = "", onPasswordResetRequest, onSignOut,
}: AccountSettingsProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showDelete, setShowDelete] = useState(false);
  const [revokingFactor, setRevokingFactor] = useState<string | null>(null);
  const [factors, setFactors] = useState<MfaFactor[]>(mfaFactors);
  const [factorErr, setFactorErr] = useState("");

  async function revokeFactorHandler(id: string) {
    setRevokingFactor(id); setFactorErr("");
    try {
      const res = await fetch(`${apiBase}/api/auth/mfa/factor/${id}/revoke`, {
        method: "POST", headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) setFactors(prev => prev.map(f => f.id === id ? { ...f, status: "revoked" } : f));
      else setFactorErr("Failed to revoke factor");
    } catch { setFactorErr("Network error"); }
    finally { setRevokingFactor(null); }
  }

  const tabBt = (t: Tab) => (
    <button key={t} onClick={() => setTab(t)}
      style={{ padding: "8px 16px", cursor: "pointer", borderBottom: tab === t ? "2px solid #3b82f6" : "none",
               background: "none", border: "none", fontWeight: tab === t ? "bold" : "normal" }}>
      {t.charAt(0).toUpperCase() + t.slice(1)}
    </button>
  );

  return (
    <div>
      <h1>Account Settings</h1>
      <p style={{ color: "#6b7280" }}>{userEmail}</p>
      <nav style={{ display: "flex", gap: "4px", borderBottom: "1px solid #e5e7eb", marginBottom: "24px" }}>
        {(["overview", "sessions", "history", "security"] as Tab[]).map(tabBt)}
      </nav>

      {tab === "overview" && (
        <div>
          <p><strong>Email:</strong> {userEmail}</p>
          <button onClick={onPasswordResetRequest} style={{ marginRight: "8px" }}>Change password</button>
          <button onClick={onSignOut}>Sign out</button>
        </div>
      )}
      {tab === "sessions" && <SessionsList sessionToken={sessionToken} apiBase={apiBase} />}
      {tab === "history" && <LoginHistory sessionToken={sessionToken} apiBase={apiBase} />}
      {tab === "security" && (
        <div>
          <h2>Two-factor authentication</h2>
          {factors.length === 0 && <p>No MFA factors enrolled.</p>}
          {factors.map(f => (
            <div key={f.id} style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
              <span>{f.factor_type}</span>
              <span style={{ color: f.status === "active" ? "green" : "gray" }}>{f.status}</span>
              {f.status === "active" && (
                <button onClick={() => revokeFactorHandler(f.id)} disabled={revokingFactor === f.id}>
                  {revokingFactor === f.id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </div>
          ))}
          {factorErr && <p role="alert" style={{ color: "red" }}>{factorErr}</p>}
          <hr style={{ marginTop: "24px", borderColor: "#fca5a5" }} />
          <h2 style={{ color: "red" }}>Danger zone</h2>
          <button onClick={() => setShowDelete(true)}
            style={{ color: "red", border: "1px solid red", background: "none", padding: "8px 16px", borderRadius: "4px" }}>
            Delete account
          </button>
        </div>
      )}

      {showDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "white", padding: "24px", borderRadius: "8px", maxWidth: "480px", width: "100%" }}>
            <DeleteAccountDialog userEmail={userEmail} sessionToken={sessionToken}
              apiBase={apiBase} onClose={() => setShowDelete(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
