"use client";
/**
 * User-facing GDPR controls:
 *   - Download my memory (export JSON)
 *   - Forget me (right-to-be-forgotten — destructive, requires confirmation)
 *
 * Composes via the user_memory_export slot (manifest.yaml).
 */
import { useState } from "react";

interface UserMemoryExportProps {
  portfolioCompanyId: string;
  portfolioUserId: string;
  apiBaseUrl?: string;
  onForgotten?: () => void;
}

export function UserMemoryExport({
  portfolioCompanyId,
  portfolioUserId,
  apiBaseUrl = "",
  onForgotten,
}: UserMemoryExportProps): JSX.Element {
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setWorking(true);
    try {
      const url =
        `${apiBaseUrl}/api/memory/recall` +
        `?portfolio_company_id=${encodeURIComponent(portfolioCompanyId)}` +
        `&portfolio_user_id=${encodeURIComponent(portfolioUserId)}` +
        `&memory_tier=long_term&limit=200`;
      const r = await fetch(url);
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `memory-export-${portfolioUserId}.json`;
      link.click();
      setMessage(`Exported ${data.count || 0} memories.`);
    } catch (e) {
      setMessage(`Export failed: ${e}`);
    } finally {
      setWorking(false);
    }
  };

  const handleForget = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setWorking(true);
    try {
      const r = await fetch(`${apiBaseUrl}/api/memory/forget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio_company_id: portfolioCompanyId,
          portfolio_user_id: portfolioUserId,
          reason: "gdpr_self_request",
        }),
      });
      const data = await r.json();
      setMessage(
        `Deleted ${data.rows_deleted_memory_items} long-term + ${data.rows_deleted_runtime_memory} working memories.`
      );
      setConfirming(false);
      onForgotten?.();
    } catch (e) {
      setMessage(`Forget failed: ${e}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          onClick={handleExport}
          disabled={working}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Download my memory
        </button>
        <button
          onClick={handleForget}
          disabled={working}
          className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
            confirming ? "bg-red-700" : "bg-red-500"
          }`}
        >
          {confirming ? "Click again to confirm — this is permanent" : "Forget me"}
        </button>
      </div>
      {message && <p className="text-sm text-gray-700">{message}</p>}
    </div>
  );
}
