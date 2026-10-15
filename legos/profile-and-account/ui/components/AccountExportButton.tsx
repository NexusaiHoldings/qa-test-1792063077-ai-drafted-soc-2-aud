"use client";
import React, { useState } from "react";

/**
 * AccountExportButton — GDPR "download my data" (slot: account_export_button).
 * Requests an export; the runtime/agent confirms + the job produces a download.
 */
interface AccountExportButtonProps {
  apiBase?: string;
  userId: string;
  format?: "json" | "csv";
}

export function AccountExportButton({ apiBase = "", userId, format = "json" }: AccountExportButtonProps) {
  const [state, setState] = useState<"idle" | "requesting" | "requested" | "error">("idle");

  async function request() {
    setState("requesting");
    try {
      const res = await fetch(`${apiBase}/api/account/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, format }),
      });
      setState(res.ok ? "requested" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "requested") {
    return <p style={{ fontSize: 13 }}>Export requested — we&apos;ll email you a download link when it&apos;s ready.</p>;
  }

  return (
    <div>
      <button type="button" onClick={request} disabled={state === "requesting"}
        style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
        {state === "requesting" ? "Requesting…" : "Download my data"}
      </button>
      {state === "error" && <p style={{ color: "#b91c1c", fontSize: 13 }}>Could not request export. Try again.</p>}
    </div>
  );
}
