"use client";
/**
 * Admin-console pane showing per-company memory rows + tier badges.
 * Composes via the admin_memory_inspector slot (manifest.yaml).
 */
import { useEffect, useState } from "react";

interface LongTermMemory {
  id: string;
  discipline: string;
  memory_type: string;
  importance: string;
  retrieval_count: number;
  contradiction_count: number;
  status: string;
  created_at: string;
  last_retrieved_at: string | null;
}

interface WorkingMemory {
  id: string;
  memory_kind: string;
  workflow_id: string | null;
  last_accessed_at: string;
  expires_at: string;
  created_at: string;
}

interface ForgetLogRow {
  id: string;
  portfolio_user_id: string;
  reason: string;
  rows_deleted_memory_items: number;
  rows_deleted_runtime_memory: number;
  created_at: string;
}

interface MemoryInspectorProps {
  portfolioCompanyId: string;
  apiBaseUrl?: string;
  limit?: number;
}

export function MemoryInspector({
  portfolioCompanyId,
  apiBaseUrl = "",
  limit = 50,
}: MemoryInspectorProps): JSX.Element {
  const [longTerm, setLongTerm] = useState<LongTermMemory[]>([]);
  const [working, setWorking] = useState<WorkingMemory[]>([]);
  const [forgetLog, setForgetLog] = useState<ForgetLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url =
      `${apiBaseUrl}/admin/memory/recent` +
      `?portfolio_company_id=${encodeURIComponent(portfolioCompanyId)}` +
      `&limit=${limit}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLongTerm(data.long_term || []);
        setWorking(data.working || []);
        setForgetLog(data.forget_log || []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioCompanyId, apiBaseUrl, limit]);

  if (loading) return <div>Loading memories...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold">Long-term ({longTerm.length})</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left">Discipline</th>
              <th className="text-left">Type</th>
              <th>Importance</th>
              <th>Retrievals</th>
              <th>Contradictions</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {longTerm.map((m) => (
              <tr key={m.id} className="border-b">
                <td>{m.discipline}</td>
                <td>{m.memory_type}</td>
                <td className="text-center">{m.importance}</td>
                <td className="text-center">{m.retrieval_count}</td>
                <td className="text-center">{m.contradiction_count}</td>
                <td>
                  <span
                    className={
                      m.status === "active"
                        ? "text-green-700"
                        : "text-gray-500"
                    }
                  >
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-semibold">Working ({working.length})</h3>
        <ul className="text-sm">
          {working.map((m) => (
            <li key={m.id}>
              <span className="font-mono text-xs">{m.id.slice(0, 8)}</span>{" "}
              <span className="text-blue-700">{m.memory_kind}</span> · expires{" "}
              {new Date(m.expires_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">
          Recent GDPR forget actions ({forgetLog.length})
        </h3>
        <ul className="text-sm">
          {forgetLog.map((r) => (
            <li key={r.id}>
              user {r.portfolio_user_id.slice(0, 8)} — deleted{" "}
              {r.rows_deleted_memory_items}/{r.rows_deleted_runtime_memory} rows
              · {r.reason} · {new Date(r.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
