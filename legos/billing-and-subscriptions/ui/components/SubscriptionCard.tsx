"use client";
/* Subscription summary card — shown on user's account page.

Shows current tier, status, next billing date, and lets user open
the Stripe Billing Portal or cancel. Loads subscription via GET
/api/billing/subscription.
*/
import React, { useEffect, useState } from "react";

export interface Subscription {
  id: string;
  stripe_subscription_id: string;
  tier_name: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
}

interface SubscriptionCardProps {
  /** Where Stripe should redirect customer back to after they finish in the portal. */
  portalReturnUrl: string;
}

export function SubscriptionCard({ portalReturnUrl }: SubscriptionCardProps) {
  const [sub, setSub] = useState<Subscription | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSub(d.subscription); })
      .catch((e) => { if (!cancelled) setError(`Load failed: ${e.message}`); });
    return () => { cancelled = true; };
  }, []);

  async function openPortal() {
    setActionLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_url: portalReturnUrl }),
      });
      if (!resp.ok) { setError(`Portal failed: ${await resp.text()}`); setActionLoading(false); return; }
      const { url } = await resp.json();
      window.location.href = url;
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
      setActionLoading(false);
    }
  }

  async function cancelSubscription() {
    if (!confirm("Cancel your subscription at end of current period?")) return;
    setActionLoading(true);
    try {
      const resp = await fetch("/api/billing/subscription/cancel", { method: "POST" });
      if (!resp.ok) { setError(`Cancel failed: ${await resp.text()}`); setActionLoading(false); return; }
      const updated = await fetch("/api/billing/subscription").then((r) => r.json());
      setSub(updated.subscription);
      setActionLoading(false);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
      setActionLoading(false);
    }
  }

  if (sub === undefined) return <div className="subscription-card loading">Loading...</div>;
  if (sub === null) return <div className="subscription-card empty">No active subscription.</div>;

  return (
    <div className="subscription-card" data-status={sub.status}>
      <h3>{sub.tier_name} <span className="status-badge">{sub.status}</span></h3>
      {sub.current_period_end && (
        <p>
          {sub.cancel_at_period_end
            ? `Cancels on ${new Date(sub.current_period_end).toLocaleDateString()}`
            : `Next billed ${new Date(sub.current_period_end).toLocaleDateString()}`}
        </p>
      )}
      {sub.trial_end && new Date(sub.trial_end) > new Date() && (
        <p className="trial-end">Trial ends {new Date(sub.trial_end).toLocaleDateString()}</p>
      )}
      {error && <div role="alert" className="subscription-error">{error}</div>}
      <div className="actions">
        <button type="button" onClick={openPortal} disabled={actionLoading}>
          Manage Billing
        </button>
        {sub.status === "active" && !sub.cancel_at_period_end && (
          <button type="button" onClick={cancelSubscription} disabled={actionLoading} className="danger">
            Cancel Subscription
          </button>
        )}
      </div>
    </div>
  );
}
