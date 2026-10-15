"use client";
/* Admin billing page — uses AdminPageTemplate + AdminTable from admin-console.

Shows all subscriptions (filterable by status + tier) + a tab for at-risk
dunning subscriptions. Per spec §4.5 admin contribution contract, this
is rendered inside the AdminShell from the admin-console lego.
*/
import React, { useEffect, useState } from "react";

interface SubscriptionRow {
  id: string;
  tier_name: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  email: string;
}

interface DunningRow {
  subscription_id: string;
  state: string;
  failed_payment_count: number;
  next_action_at: string | null;
  tier_name: string;
  email: string;
}

interface AdminBillingPageProps {
  /** Injected by admin-console: standardized AdminPageTemplate component. */
  AdminPageTemplate: React.ComponentType<{ title: string; breadcrumbs: { label: string }[]; children: React.ReactNode }>;
  /** Injected by admin-console: standardized AdminTable component. */
  AdminTable: React.ComponentType<{ columns: { key: string; header: string; sortable?: boolean }[]; rows: any[]; loading?: boolean }>;
  /** Admin auth token, attached to outgoing requests. */
  adminToken: string;
}

export function AdminBillingPage({ AdminPageTemplate, AdminTable, adminToken }: AdminBillingPageProps) {
  const [tab, setTab] = useState<"subscriptions" | "dunning">("subscriptions");
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [dunning, setDunning] = useState<DunningRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = tab === "subscriptions"
      ? "/admin/billing/subscriptions?limit=100"
      : "/admin/billing/dunning";
    fetch(url, { headers: { "X-Admin-Token": adminToken } })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (tab === "subscriptions") setSubs(d.subscriptions || []);
        else setDunning(d.at_risk || []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, adminToken]);

  const subColumns = [
    { key: "tier_name", header: "Tier", sortable: true },
    { key: "status", header: "Status", sortable: true },
    { key: "email", header: "Email" },
    { key: "current_period_end", header: "Current Period Ends", sortable: true },
    { key: "cancel_at_period_end", header: "Cancellation Pending" },
  ];
  const dunningColumns = [
    { key: "state", header: "Dunning State", sortable: true },
    { key: "failed_payment_count", header: "Failed Payments" },
    { key: "tier_name", header: "Tier" },
    { key: "email", header: "Email" },
    { key: "next_action_at", header: "Next Action At", sortable: true },
  ];

  return (
    <AdminPageTemplate
      title="Billing"
      breadcrumbs={[{ label: "Admin" }, { label: "Billing" }]}
    >
      <div className="admin-billing-tabs">
        <button
          className={tab === "subscriptions" ? "tab active" : "tab"}
          onClick={() => setTab("subscriptions")}
        >
          All Subscriptions
        </button>
        <button
          className={tab === "dunning" ? "tab active" : "tab"}
          onClick={() => setTab("dunning")}
        >
          Dunning ({dunning.length})
        </button>
      </div>
      {tab === "subscriptions" ? (
        <AdminTable columns={subColumns} rows={subs} loading={loading} />
      ) : (
        <AdminTable columns={dunningColumns} rows={dunning} loading={loading} />
      )}
    </AdminPageTemplate>
  );
}
