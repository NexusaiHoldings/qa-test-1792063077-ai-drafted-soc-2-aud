/**
 * /admin/billing — Billing admin (admin-billing-001).
 *
 * Portfolio-level view of every subscription: who's subscribed, what tier, what
 * status, and whether they're set to cancel. Summary cards show active-tier and
 * status counts. Reads /api/admin/billing/subscriptions (billing lego). Read-only
 * — subscription changes happen in Stripe / the customer portal; this is the
 * "see the book of business" surface. First-class styling for the AdminShell
 * light content area (the admin console isn't theme-tokened).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface SubRow {
  id: string;
  stripe_subscription_id: string;
  tier_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  created_at: string | null;
  user_id: string;
  email: string;
  stripe_customer_id: string;
}

interface Payload {
  subscriptions: SubRow[];
  total: number;
  by_status: Record<string, number>;
  by_active_tier: Record<string, number>;
  error?: string;
}

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)", overflow: "hidden",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: 12, fontWeight: 600,
  color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em",
  borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
};
const td: React.CSSProperties = {
  padding: "12px 16px", fontSize: 14, color: "#0f172a", borderBottom: "1px solid #f1f5f9",
};
const stat: React.CSSProperties = {
  ...card, padding: "16px 18px", minWidth: 130, flex: "0 0 auto",
};

function pill(status: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    active: ["#dcfce7", "#166534"],
    trialing: ["#dbeafe", "#1e40af"],
    past_due: ["#fef9c3", "#854d0e"],
    cancelled: ["#fee2e2", "#991b1b"],
    canceled: ["#fee2e2", "#991b1b"],
    incomplete: ["#f1f5f9", "#475569"],
    unpaid: ["#fee2e2", "#991b1b"],
  };
  const [bg, fg] = map[status] || ["#f1f5f9", "#475569"];
  return { background: bg, color: fg, fontSize: 12, fontWeight: 600,
    padding: "2px 10px", borderRadius: 999, textTransform: "capitalize" };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString(); } catch { return String(ts); }
}

export default function BillingAdminPage(): JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/billing/subscriptions", { cache: "no-store" });
      const d = (await r.json()) as Payload;
      setData(d);
      setErr(d.error || null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTotal = useMemo(() => {
    if (!data) return 0;
    return (data.by_status.active || 0) + (data.by_status.trialing || 0);
  }, [data]);

  const subs = data?.subscriptions || [];

  return (
    <div style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Billing</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          Every subscription on this company — who&apos;s paying, what tier, and what&apos;s renewing.
          Subscription changes happen in Stripe; this is the book of business.
        </p>
      </div>

      {err && (
        <div style={{ ...card, padding: 16, marginBottom: 16, color: "#991b1b", background: "#fef2f2", borderColor: "#fecaca" }}>
          Couldn&apos;t load billing: {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={stat}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>ACTIVE</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{activeTotal}</div>
        </div>
        <div style={stat}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>TOTAL</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{data?.total ?? 0}</div>
        </div>
        {Object.entries(data?.by_active_tier || {}).map(([tier, n]) => (
          <div style={stat} key={tier}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{tier}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{n}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Customer</th>
              <th style={th}>Tier</th>
              <th style={th}>Status</th>
              <th style={th}>Renews / ends</th>
              <th style={th}>Started</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={td} colSpan={5}>Loading…</td></tr>
            ) : subs.length === 0 ? (
              <tr><td style={{ ...td, color: "#64748b" }} colSpan={5}>No subscriptions yet.</td></tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{s.email}</td>
                  <td style={td}>{s.tier_name}</td>
                  <td style={td}>
                    <span style={pill(s.status)}>{s.status}</span>
                    {s.cancel_at_period_end && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: "#b45309" }}>cancels at period end</span>
                    )}
                  </td>
                  <td style={{ ...td, color: "#64748b" }}>{fmt(s.current_period_end)}</td>
                  <td style={{ ...td, color: "#64748b" }}>{fmt(s.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
